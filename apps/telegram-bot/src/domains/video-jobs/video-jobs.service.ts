import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { VideoJob, VideoJobStatus } from './video-job.entity';
import { CreateVideoJobDto } from './dto/create-video-job.dto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RemotionService } from '../remotion/remotion.service';
import { Driver } from '../parser/classes/driver.class';
import { User } from '../auth/user.entity';
import { UserRole } from '../auth/user-role.enum';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class VideoJobsService {
  private readonly logger = new Logger(VideoJobsService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private processing = false;

  constructor(
    @InjectRepository(VideoJob)
    private readonly videoJobRepository: Repository<VideoJob>,
    private readonly remotionService: RemotionService,
  ) {
    this.bucket = process.env.S3_BUCKET || process.env.REMOTION_BUCKET!;
    this.s3Client = new S3Client({
      region: process.env.S3_REGION || process.env.REMOTION_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.REMOTION_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  // ─── Rate limit ───────────────────────────────────────

  async checkDailyLimit(user: User): Promise<void> {
    if (user.role === UserRole.ADMIN) return;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await this.videoJobRepository.count({
      where: { userId: user.id, createdAt: MoreThan(dayAgo) },
    });
    if (recentCount >= 5) {
      throw new BadRequestException('Limit reached: max 5 render jobs per 24 hours');
    }
  }

  // ─── CRUD ──────────────────────────────────────────────

  async create(dto: CreateVideoJobDto, user?: User): Promise<VideoJob> {
    if (user) await this.checkDailyLimit(user);

    const job = new VideoJob();
    job.raceUrl = dto.raceUrl;
    job.raceName = dto.raceData?.raceName || null;
    job.driverName = dto.driverName;
    job.offset = dto.offset;
    job.videoDurationSec = dto.videoDurationSec ?? null;
    job.uploadDurationMs = dto.uploadDurationMs ?? null;
    job.sourceVideoS3Key = dto.sourceVideoS3Key;
    job.raceData = dto.raceData;
    job.status = VideoJobStatus.PENDING;
    if (user) {
      job.userId = user.id;
    }
    const saved = await this.videoJobRepository.save(job);
    this.logger.log(`Job created: ${saved.id} by user ${user?.id || 'anonymous'}`);
    return saved;
  }

  async findAll(options: { page?: number; limit?: number; userId?: string; archived?: boolean } = {}): Promise<{ data: VideoJob[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const where: any = {};
    if (options.userId) {
      where.userId = options.userId;
    }
    if (!options.archived) {
      where.archivedAt = IsNull();
    }
    const [data, total] = await this.videoJobRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<VideoJob | null> {
    return this.videoJobRepository.findOne({ where: { id } });
  }

  async archive(id: string): Promise<void> {
    const job = await this.videoJobRepository.findOne({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    await this.videoJobRepository.update(id, { archivedAt: new Date() });
    this.logger.log(`Job ${id} archived`);
  }

  // ─── S3 ────────────────────────────────────────────────

  async getPresignedUploadUrl(): Promise<{ url: string; key: string }> {
    const key = `videos/input-${uuidv4()}.mp4`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: 'video/mp4',
    });
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    return { url, key };
  }

  async getPresignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  // ─── Cron: process jobs every 5 seconds ────────────────

  @Interval(5000)
  async processJobs() {
    if (this.processing) return;
    this.processing = true;
    try {
      const jobs = await this.videoJobRepository.find({
        where: { status: In([VideoJobStatus.PENDING, VideoJobStatus.PROCESSING]) },
        order: { createdAt: 'ASC' },
      });

      let hasActiveRender = jobs.some((j) => j.status === VideoJobStatus.PROCESSING);

      for (const job of jobs) {
        try {
          if (job.status === VideoJobStatus.PENDING) {
            if (hasActiveRender) continue;
            await this.startJob(job);
            hasActiveRender = true;
          } else if (job.status === VideoJobStatus.PROCESSING) {
            await this.checkJob(job);
          }
        } catch (error) {
          this.logger.error(`Job ${job.id} failed`, error);
          await this.videoJobRepository.update(job.id, {
            status: VideoJobStatus.ERROR,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.processing = false;
    }
  }

  // ─── Start a pending job ───────────────────────────────

  private async startJob(job: VideoJob): Promise<void> {
    const driverDto = job.raceData?.drivers?.find(
      (d: any) => d.name.toLowerCase().includes(job.driverName.toLowerCase()),
    );
    if (!driverDto) throw new Error(`Driver "${job.driverName}" not found in race data`);

    const driver = Driver.fromDto(driverDto);
    const allDrivers = (job.raceData?.drivers || []).map((d: any) => Driver.fromDto(d));
    const sourceVideoUrl = await this.getPresignedDownloadUrl(job.sourceVideoS3Key);

    const handle = await this.remotionService.startLambdaRender(driver, job.offset, sourceVideoUrl, allDrivers);

    await this.videoJobRepository.update(job.id, {
      status: VideoJobStatus.PROCESSING,
      remotionRenderId: handle.renderId,
      remotionBucketName: handle.bucketName,
      renderStartedAt: new Date(),
    });

    this.logger.log(`Job ${job.id} Lambda render started: ${handle.renderId}`);
  }

  // ─── Check progress of a processing job ────────────────

  private async checkJob(job: VideoJob): Promise<void> {
    if (!job.remotionRenderId || !job.remotionBucketName) {
      await this.videoJobRepository.update(job.id, {
        status: VideoJobStatus.ERROR,
        errorMessage: 'Missing Lambda render handle (remotionRenderId or remotionBucketName)',
      });
      return;
    }

    const result = await this.remotionService.checkLambdaProgress(
      job.remotionRenderId,
      job.remotionBucketName,
    );

    if (result.fatalError) {
      throw new Error(`Render failed: ${result.fatalError}`);
    }

    if (result.done && result.outputFile) {
      const renderDurationMs = job.renderStartedAt
        ? Date.now() - job.renderStartedAt.getTime()
        : null;

      const resultKey = this.extractS3Key(result.outputFile);

      this.logger.log(`Job ${job.id} done in ${renderDurationMs ? (renderDurationMs / 1000).toFixed(1) + 's' : '?'}`);

      await this.videoJobRepository.update(job.id, {
        status: VideoJobStatus.DONE,
        resultVideoS3Key: resultKey,
        renderDurationMs,
      });
    }
  }

  // ─── Helpers ───────────────────────────────────────────

  /**
   * Extracts S3 key from a full S3 URL or returns the value as-is if already a key.
   */
  private extractS3Key(urlOrKey: string): string {
    if (!urlOrKey.startsWith('http')) return urlOrKey;
    try {
      const url = new URL(urlOrKey);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 1) {
        return parts.slice(1).join('/');
      }
      return url.pathname.replace(/^\//, '');
    } catch {
      return urlOrKey;
    }
  }
}
