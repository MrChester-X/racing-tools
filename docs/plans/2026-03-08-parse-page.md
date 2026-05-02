# Parse Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a /parse page with race parsing, video editor, and Remotion-based video processing with S3 storage.

**Architecture:** New NestJS module `video-jobs` with TypeORM entity, REST controller, and background processing. New Next.js page `/parse` with Zustand store. Direct S3 upload via presigned URLs. All video processing through Remotion Lambda (no FFmpeg).

**Tech Stack:** Next.js 15, React 19, Tailwind, Zustand (frontend); NestJS, TypeORM, PostgreSQL, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @remotion/lambda (backend)

---

### Task 1: Database setup — TypeORM config and VideoJob entity

**Files:**
- Modify: `telegram-race-timer/src/app.module.ts`
- Create: `telegram-race-timer/src/domains/video-jobs/video-job.entity.ts`

**Step 1: Add TypeORM to app.module.ts**

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramModule } from './app/telegram/telegram.module';
import { DomainsModule } from './domains/domains.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_DATABASE', 'racing'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    TelegramModule,
    DomainsModule,
  ],
})
export class AppModule {}
```

**Step 2: Create VideoJob entity**

```typescript
// video-job.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum VideoJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  ERROR = 'error',
}

@Entity('video_jobs')
export class VideoJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  raceUrl: string;

  @Column()
  driverName: string;

  @Column('float')
  offset: number;

  @Column('float')
  trimStart: number;

  @Column('float')
  trimEnd: number;

  @Column()
  sourceVideoS3Key: string;

  @Column({ nullable: true })
  resultVideoS3Key: string;

  @Column({ type: 'enum', enum: VideoJobStatus, default: VideoJobStatus.PENDING })
  status: VideoJobStatus;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  raceData: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Step 3: Add .env variables**

Add to `.env.example`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=racing
S3_BUCKET=your-racing-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_key
S3_SECRET_ACCESS_KEY=your_secret
```

User will provide actual .env values.

---

### Task 2: VideoJobs module — DTOs, controller, service

**Files:**
- Create: `telegram-race-timer/src/domains/video-jobs/video-jobs.module.ts`
- Create: `telegram-race-timer/src/domains/video-jobs/video-jobs.controller.ts`
- Create: `telegram-race-timer/src/domains/video-jobs/video-jobs.service.ts`
- Create: `telegram-race-timer/src/domains/video-jobs/dto/create-video-job.dto.ts`
- Create: `telegram-race-timer/src/domains/video-jobs/dto/video-job-response.dto.ts`
- Modify: `telegram-race-timer/src/domains/domains.module.ts`

**Step 1: Create DTOs**

```typescript
// create-video-job.dto.ts
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVideoJobDto {
  @ApiProperty({ example: 'https://timing.batyrshin.name/tracks/premium/heats/68525' })
  @IsString()
  raceUrl: string;

  @ApiProperty({ example: 'Kuksenko' })
  @IsString()
  driverName: string;

  @ApiProperty({ example: 15.234 })
  @IsNumber()
  offset: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  trimStart: number;

  @ApiProperty({ example: 120.5 })
  @IsNumber()
  trimEnd: number;

  @ApiProperty({ example: 'videos/input-abc123.mp4' })
  @IsString()
  sourceVideoS3Key: string;

  @ApiProperty({ required: false })
  @IsOptional()
  raceData?: any;
}
```

```typescript
// video-job-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { VideoJobStatus } from '../video-job.entity';

export class VideoJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  raceUrl: string;

  @ApiProperty()
  driverName: string;

  @ApiProperty()
  offset: number;

  @ApiProperty()
  trimStart: number;

  @ApiProperty()
  trimEnd: number;

  @ApiProperty()
  sourceVideoS3Key: string;

  @ApiProperty({ required: false })
  resultVideoS3Key?: string;

  @ApiProperty({ enum: VideoJobStatus })
  status: VideoJobStatus;

  @ApiProperty({ required: false })
  errorMessage?: string;

  @ApiProperty({ required: false })
  raceData?: any;

  @ApiProperty({ required: false })
  downloadUrl?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
```

**Step 2: Create service**

```typescript
// video-jobs.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoJob, VideoJobStatus } from './video-job.entity';
import { CreateVideoJobDto } from './dto/create-video-job.dto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RemotionService } from '../remotion/remotion.service';
import { Driver } from '../parser/classes/driver.class';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class VideoJobsService {
  private readonly logger = new Logger(VideoJobsService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(VideoJob)
    private readonly videoJobRepository: Repository<VideoJob>,
    private readonly remotionService: RemotionService,
  ) {
    this.bucket = process.env.S3_BUCKET!;
    this.s3Client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

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

  async create(dto: CreateVideoJobDto): Promise<VideoJob> {
    const job = this.videoJobRepository.create({
      raceUrl: dto.raceUrl,
      driverName: dto.driverName,
      offset: dto.offset,
      trimStart: dto.trimStart,
      trimEnd: dto.trimEnd,
      sourceVideoS3Key: dto.sourceVideoS3Key,
      raceData: dto.raceData,
      status: VideoJobStatus.PENDING,
    });
    const saved = await this.videoJobRepository.save(job);
    this.processJob(saved.id).catch((err) => this.logger.error(`Job ${saved.id} failed`, err));
    return saved;
  }

  async findAll(): Promise<VideoJob[]> {
    return this.videoJobRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<VideoJob | null> {
    return this.videoJobRepository.findOne({ where: { id } });
  }

  private async processJob(jobId: string): Promise<void> {
    const job = await this.videoJobRepository.findOneOrFail({ where: { id: jobId } });
    try {
      await this.videoJobRepository.update(jobId, { status: VideoJobStatus.PROCESSING });

      // Build Driver from saved raceData
      const raceData = job.raceData;
      const driverDto = raceData.drivers.find(
        (d: any) => d.name.toLowerCase().includes(job.driverName.toLowerCase()),
      );
      if (!driverDto) throw new Error(`Driver "${job.driverName}" not found in race data`);

      const driver = Driver.fromDto(driverDto);

      // Build source video S3 URL
      const sourceVideoUrl = await this.getPresignedDownloadUrl(job.sourceVideoS3Key);

      // Render via Remotion Lambda with source video
      const resultUrl = await this.remotionService.renderWithSourceVideo(
        driver,
        job.offset,
        sourceVideoUrl,
        job.trimStart,
        job.trimEnd,
      );

      // Extract S3 key from result URL or store the full URL
      await this.videoJobRepository.update(jobId, {
        status: VideoJobStatus.DONE,
        resultVideoS3Key: resultUrl,
      });
    } catch (error) {
      this.logger.error(`Job ${jobId} processing failed`, error);
      await this.videoJobRepository.update(jobId, {
        status: VideoJobStatus.ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

**Step 3: Create controller**

```typescript
// video-jobs.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { VideoJobsService } from './video-jobs.service';
import { CreateVideoJobDto } from './dto/create-video-job.dto';
import { VideoJobResponseDto } from './dto/video-job-response.dto';

@ApiTags('Video Jobs')
@Controller('video-jobs')
export class VideoJobsController {
  constructor(private readonly videoJobsService: VideoJobsService) {}

  @Post('presign-upload')
  @ApiOperation({ summary: 'Get presigned URL for video upload to S3' })
  async presignUpload() {
    return this.videoJobsService.getPresignedUploadUrl();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new video processing job' })
  async create(@Body() dto: CreateVideoJobDto) {
    return this.videoJobsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all video jobs' })
  async findAll() {
    return this.videoJobsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video job details with download URL' })
  async findOne(@Param('id') id: string): Promise<VideoJobResponseDto> {
    const job = await this.videoJobsService.findOne(id);
    if (!job) throw new Error('Job not found');
    const response: VideoJobResponseDto = { ...job };
    if (job.resultVideoS3Key) {
      response.downloadUrl = await this.videoJobsService.getPresignedDownloadUrl(job.resultVideoS3Key);
    }
    return response;
  }
}
```

**Step 4: Create module**

```typescript
// video-jobs.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoJob } from './video-job.entity';
import { VideoJobsController } from './video-jobs.controller';
import { VideoJobsService } from './video-jobs.service';
import { RemotionModule } from '../remotion/remotion.module';

@Module({
  imports: [TypeOrmModule.forFeature([VideoJob]), RemotionModule],
  controllers: [VideoJobsController],
  providers: [VideoJobsService],
})
export class VideoJobsModule {}
```

**Step 5: Register in DomainsModule**

```typescript
// domains.module.ts
import { Module } from '@nestjs/common';
import { HandlerModule } from './handler/handler.module';
import { VideoModule } from './video/video.module';
import { VideoJobsModule } from './video-jobs/video-jobs.module';

@Module({
  imports: [HandlerModule, VideoModule, VideoJobsModule],
})
export class DomainsModule {}
```

---

### Task 3: Remotion — add renderWithSourceVideo method

**Files:**
- Modify: `telegram-race-timer/src/domains/remotion/remotion.service.ts`

**Step 1: Add renderWithSourceVideo to RemotionService**

Add this method to the existing RemotionService class:

```typescript
async renderWithSourceVideo(
  driver: Driver,
  offset: number,
  sourceVideoUrl: string,
  trimStart: number,
  trimEnd: number,
): Promise<string> {
  const laps = this.buildLapData(driver);
  const totalLaps = driver.laps.length;
  const durationSeconds = trimEnd - trimStart;

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: this.region,
    functionName: this.functionName,
    serveUrl: this.serveUrl,
    composition: 'RaceOverlayWithVideo',
    codec: 'h264',
    inputProps: {
      laps,
      totalLaps,
      offsetSeconds: offset,
      driverName: driver.name,
      driverPosition: driver.index + 1,
      totalDrivers: 10,
      sourceVideoUrl,
      trimStart,
      trimEnd,
    },
  });

  // Poll for completion
  while (true) {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName: this.functionName,
      region: this.region,
    });

    if (progress.fatalErrorEncountered) {
      throw new Error(`Render failed: ${progress.errors?.[0]?.message}`);
    }

    if (progress.done) {
      return progress.outputFile!;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}
```

---

### Task 4: Remotion composition — RaceOverlayWithVideo

**Files:**
- Create: `remotion/src/RaceOverlayWithVideo.tsx`
- Create: `remotion/src/types.ts` (add new type)
- Modify: `remotion/src/Root.tsx`

**Step 1: Add new types**

Add to `remotion/src/types.ts`:

```typescript
export interface RaceOverlayWithVideoProps extends RaceOverlayProps {
  sourceVideoUrl: string;
  trimStart: number;
  trimEnd: number;
}
```

**Step 2: Create RaceOverlayWithVideo composition**

```tsx
// RaceOverlayWithVideo.tsx
import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import { RaceOverlayWithVideoProps } from "./types";
import { RaceOverlay } from "./RaceOverlay";

export const RaceOverlayWithVideo: React.FC<RaceOverlayWithVideoProps> = (props) => {
  const { sourceVideoUrl, trimStart, trimEnd, ...overlayProps } = props;

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={sourceVideoUrl}
        startFrom={Math.round(trimStart * 30)}
        endAt={Math.round(trimEnd * 30)}
        style={{ width: "100%", height: "100%" }}
      />
      <RaceOverlay {...overlayProps} />
    </AbsoluteFill>
  );
};
```

**Step 3: Register in Root.tsx**

Add a second Composition to Root.tsx for `RaceOverlayWithVideo`:

```tsx
import { RaceOverlayWithVideo } from "./RaceOverlayWithVideo";
import { RaceOverlayWithVideoProps } from "./types";

// Add after existing Composition:
<Composition<RaceOverlayWithVideoProps>
  id="RaceOverlayWithVideo"
  component={RaceOverlayWithVideo}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{
    laps: [
      { count: 0, time: 27.5, absoluteStartTime: 0, absoluteEndTime: 27.5, isBestSoFar: true },
      { count: 1, time: 28.1, absoluteStartTime: 27.5, absoluteEndTime: 55.6, isBestSoFar: false },
    ],
    totalLaps: 2,
    offsetSeconds: 0,
    driverName: "Test Driver",
    driverPosition: 3,
    totalDrivers: 10,
    sourceVideoUrl: "",
    trimStart: 0,
    trimEnd: 60,
  }}
  calculateMetadata={({ props }) => {
    const duration = props.trimEnd - props.trimStart;
    return {
      durationInFrames: Math.ceil(duration * 30),
      fps: 30,
    };
  }}
/>
```

**Step 4: Deploy updated Remotion bundle to S3**

This needs to be done manually: `npx remotion lambda sites create src/index.ts --site-name=prod`

---

### Task 5: Install @aws-sdk/s3-request-presigner

**Step 1: Install dependency**

Run in `telegram-race-timer/`:
```bash
npm install @aws-sdk/s3-request-presigner
```

---

### Task 6: Frontend — Parse page store

**Files:**
- Create: `race-time-front/src/app/parse/store/useParseStore.ts`
- Create: `race-time-front/src/app/parse/types.ts`

**Step 1: Create types**

```typescript
// types.ts
export interface DriverLapData {
  count: number;
  time: number;
  stintText?: string;
}

export interface DriverData {
  index: number;
  name: string;
  startKart: string;
  karts: string[];
  laps: DriverLapData[];
}

export interface RaceData {
  pitlane?: string[];
  drivers: DriverData[];
}

export interface VideoJob {
  id: string;
  raceUrl: string;
  driverName: string;
  offset: number;
  trimStart: number;
  trimEnd: number;
  sourceVideoS3Key: string;
  resultVideoS3Key?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  raceData?: RaceData;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Create Zustand store**

```typescript
// useParseStore.ts
import { create } from 'zustand';
import axios from 'axios';
import { RaceData, DriverData, VideoJob } from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ParseState {
  // Race parsing
  raceUrl: string;
  raceData: RaceData | null;
  selectedDriver: DriverData | null;
  isLoadingRace: boolean;
  raceError: string | null;

  // Video editor
  videoFile: File | null;
  videoDuration: number;
  offset: number;
  trimStart: number;
  trimEnd: number;

  // Jobs
  jobs: VideoJob[];
  isLoadingJobs: boolean;
  selectedJob: VideoJob | null;
  isModalOpen: boolean;

  // Submission
  isSubmitting: boolean;

  // Actions
  setRaceUrl: (url: string) => void;
  loadRace: () => Promise<void>;
  selectDriver: (driver: DriverData | null) => void;
  setVideoFile: (file: File | null) => void;
  setVideoDuration: (duration: number) => void;
  setOffset: (offset: number) => void;
  setTrimStart: (trimStart: number) => void;
  setTrimEnd: (trimEnd: number) => void;
  submitJob: () => Promise<void>;
  loadJobs: () => Promise<void>;
  openJobModal: (job: VideoJob) => void;
  closeJobModal: () => void;
}

export const useParseStore = create<ParseState>((set, get) => ({
  raceUrl: '',
  raceData: null,
  selectedDriver: null,
  isLoadingRace: false,
  raceError: null,
  videoFile: null,
  videoDuration: 0,
  offset: 0,
  trimStart: 0,
  trimEnd: 0,
  jobs: [],
  isLoadingJobs: false,
  selectedJob: null,
  isModalOpen: false,
  isSubmitting: false,

  setRaceUrl: (url) => set({ raceUrl: url }),

  loadRace: async () => {
    const { raceUrl } = get();
    if (!raceUrl) return;
    set({ isLoadingRace: true, raceError: null });
    try {
      const { data } = await axios.get<RaceData>(`${API_URL}/parser/race`, {
        params: { url: raceUrl },
      });
      set({ raceData: data, isLoadingRace: false, selectedDriver: null });
    } catch (error: any) {
      set({ raceError: error.message || 'Failed to load race', isLoadingRace: false });
    }
  },

  selectDriver: (driver) => set({ selectedDriver: driver }),

  setVideoFile: (file) => set({ videoFile: file }),
  setVideoDuration: (duration) => set({ videoDuration: duration, trimEnd: duration }),
  setOffset: (offset) => set({ offset }),
  setTrimStart: (trimStart) => set({ trimStart }),
  setTrimEnd: (trimEnd) => set({ trimEnd }),

  submitJob: async () => {
    const { videoFile, raceUrl, selectedDriver, offset, trimStart, trimEnd, raceData } = get();
    if (!videoFile || !selectedDriver || !raceData) return;
    set({ isSubmitting: true });
    try {
      // 1. Get presigned upload URL
      const { data: presign } = await axios.post<{ url: string; key: string }>(
        `${API_URL}/video-jobs/presign-upload`,
      );

      // 2. Upload video directly to S3
      await axios.put(presign.url, videoFile, {
        headers: { 'Content-Type': 'video/mp4' },
      });

      // 3. Create job
      await axios.post(`${API_URL}/video-jobs`, {
        raceUrl,
        driverName: selectedDriver.name,
        offset,
        trimStart,
        trimEnd,
        sourceVideoS3Key: presign.key,
        raceData,
      });

      set({ isSubmitting: false });
      get().loadJobs();
    } catch (error) {
      set({ isSubmitting: false });
      console.error('Submit failed', error);
    }
  },

  loadJobs: async () => {
    set({ isLoadingJobs: true });
    try {
      const { data } = await axios.get<VideoJob[]>(`${API_URL}/video-jobs`);
      set({ jobs: data, isLoadingJobs: false });
    } catch {
      set({ isLoadingJobs: false });
    }
  },

  openJobModal: async (job) => {
    try {
      const { data } = await axios.get<VideoJob>(`${API_URL}/video-jobs/${job.id}`);
      set({ selectedJob: data, isModalOpen: true });
    } catch {
      set({ selectedJob: job, isModalOpen: true });
    }
  },

  closeJobModal: () => set({ isModalOpen: false, selectedJob: null }),
}));
```

---

### Task 7: Frontend — Parse page UI (race parsing section)

**Files:**
- Create: `race-time-front/src/app/parse/page.tsx`
- Create: `race-time-front/src/app/parse/components/RaceParserSection.tsx`
- Create: `race-time-front/src/app/parse/components/DriverStats.tsx`

**Step 1: Create DriverStats component**

Shows statistics like Telegram bot: top 5 best, top 5 median, top 5 worst, last 3, all laps.

```tsx
// DriverStats.tsx
'use client';
import { DriverData } from '../types';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
  return secs.toFixed(3);
}

function formatAbsoluteTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function DriverStats({ driver, offset }: { driver: DriverData; offset: number }) {
  const laps = driver.laps;
  const sorted = [...laps].sort((a, b) => a.time - b.time);

  const getAbsStart = (lap: typeof laps[0]) =>
    laps.slice(0, lap.count).reduce((sum, l) => sum + l.time, 0);

  const lapLine = (lap: typeof laps[0]) =>
    `#${lap.count + 1} ${formatTime(lap.time)} (на ${formatAbsoluteTime(getAbsStart(lap) + offset)})`;

  const bestLaps = sorted.slice(0, 5);
  const midIndex = Math.floor(sorted.length / 2);
  const medianLaps = sorted.slice(midIndex - 3, midIndex + 3);
  const worstLaps = sorted.slice(-5);
  const lastLaps = laps.slice(-3);

  const Section = ({ title, items }: { title: string; items: typeof laps }) => (
    <div className="mb-4">
      <h4 className="text-orange-400 font-semibold text-sm mb-1">{title}</h4>
      <div className="text-gray-300 text-sm font-mono space-y-0.5">
        {items.map((lap, i) => (
          <div key={i}>{lapLine(lap)}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <h3 className="text-white font-bold text-lg mb-3">{driver.name}</h3>
      <p className="text-gray-400 text-sm mb-4">
        Карты: {driver.karts.join(' → ')} | Кругов: {laps.length}
      </p>
      <Section title="Топ 5 лучших кругов" items={bestLaps} />
      <Section title="Топ 5 медианных кругов" items={medianLaps} />
      <Section title="Топ 5 худших кругов" items={worstLaps} />
      <Section title="3 последних круга" items={lastLaps} />
      <Section title={`Все круги (${Math.min(laps.length, 20)})`} items={laps.slice(0, 20)} />
    </div>
  );
}
```

**Step 2: Create RaceParserSection**

```tsx
// RaceParserSection.tsx
'use client';
import { useParseStore } from '../store/useParseStore';
import { DriverStats } from './DriverStats';

export function RaceParserSection() {
  const {
    raceUrl, setRaceUrl, loadRace, isLoadingRace, raceError,
    raceData, selectedDriver, selectDriver, offset, setOffset,
  } = useParseStore();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Парсинг заезда</h2>

      {/* URL input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={raceUrl}
          onChange={(e) => setRaceUrl(e.target.value)}
          placeholder="https://timing.batyrshin.name/tracks/premium/heats/..."
          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={loadRace}
          disabled={isLoadingRace || !raceUrl}
          className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50 transition-all"
        >
          {isLoadingRace ? 'Загрузка...' : 'Загрузить'}
        </button>
      </div>

      {raceError && (
        <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{raceError}</div>
      )}

      {/* Driver selector + offset */}
      {raceData && (
        <div className="flex gap-3 items-center">
          <select
            value={selectedDriver?.name || ''}
            onChange={(e) => {
              const d = raceData.drivers.find((d) => d.name === e.target.value);
              selectDriver(d || null);
            }}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-orange-500"
          >
            <option value="">Выберите гонщика</option>
            {raceData.drivers.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} (карт {d.startKart})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-sm">Offset (сек):</label>
            <input
              type="number"
              step="0.1"
              value={offset}
              onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
              className="w-24 bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      )}

      {/* Driver stats */}
      {selectedDriver && <DriverStats driver={selectedDriver} offset={offset} />}
    </div>
  );
}
```

---

### Task 8: Frontend — Video editor component

**Files:**
- Create: `race-time-front/src/app/parse/components/VideoEditorSection.tsx`

**Step 1: Create VideoEditorSection**

```tsx
// VideoEditorSection.tsx
'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { useParseStore } from '../store/useParseStore';

export function VideoEditorSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    videoFile, setVideoFile, setVideoDuration,
    offset, setOffset, trimStart, setTrimStart, trimEnd, setTrimEnd,
    videoDuration, selectedDriver, isSubmitting, submitJob,
  } = useParseStore();

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleFileChange = useCallback((file: File | null) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setVideoFile(file);
    } else {
      setVideoUrl(null);
      setVideoFile(null);
    }
  }, [videoUrl, setVideoFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('video/')) handleFileChange(file);
  }, [handleFileChange]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      // Stop at trim end
      if (videoRef.current.currentTime >= trimEnd) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const stepFrame = (direction: number) => {
    if (videoRef.current) {
      // Assume ~30fps
      const frameTime = 1 / 30;
      seekTo(videoRef.current.currentTime + direction * frameTime);
    }
  };

  const playTrimmed = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = trimStart;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2);
    return `${m}:${sec.padStart(5, '0')}`;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Видеоредактор</h2>

      {/* Drop zone / file input */}
      {!videoUrl ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center hover:border-orange-500/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById('video-input')?.click()}
        >
          <p className="text-gray-400 text-lg mb-2">Перетащите видео сюда</p>
          <p className="text-gray-500 text-sm">или нажмите для выбора файла</p>
          <input
            id="video-input"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Video player */}
          <div className="relative rounded-xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              className="w-full max-h-[500px]"
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => stepFrame(-1)} className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-sm transition-colors">
              ◀ Кадр
            </button>
            <button onClick={togglePlay} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              {isPlaying ? '⏸ Пауза' : '▶ Играть'}
            </button>
            <button onClick={() => stepFrame(1)} className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-sm transition-colors">
              Кадр ▶
            </button>
            <button onClick={playTrimmed} className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-sm transition-colors">
              ▶ Превью фрагмента
            </button>
            <button
              onClick={() => handleFileChange(null)}
              className="bg-white/10 hover:bg-red-500/30 text-gray-400 hover:text-red-400 px-3 py-2 rounded-lg text-sm transition-colors ml-auto"
            >
              Удалить видео
            </button>
          </div>

          {/* Current time */}
          <div className="text-gray-400 text-sm font-mono">
            Текущее время: {formatTime(currentTime)} / {formatTime(videoDuration)}
          </div>

          {/* Sliders */}
          <div className="space-y-3 bg-white/5 rounded-xl p-4 border border-white/10">
            {/* Offset */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-400">Начало отсечки (offset)</label>
                <span className="text-orange-400 font-mono">{formatTime(offset)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={videoDuration}
                  step={0.033}
                  value={offset}
                  onChange={(e) => setOffset(parseFloat(e.target.value))}
                  className="flex-1 accent-orange-500"
                />
                <button onClick={() => setOffset(currentTime)} className="text-xs bg-orange-600/30 text-orange-300 px-2 py-1 rounded hover:bg-orange-600/50 transition-colors">
                  Текущее
                </button>
              </div>
            </div>

            {/* Trim start */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-400">Начало монтажа</label>
                <span className="text-green-400 font-mono">{formatTime(trimStart)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={trimEnd}
                  step={0.033}
                  value={trimStart}
                  onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                  className="flex-1 accent-green-500"
                />
                <button onClick={() => { setTrimStart(currentTime); seekTo(currentTime); }} className="text-xs bg-green-600/30 text-green-300 px-2 py-1 rounded hover:bg-green-600/50 transition-colors">
                  Текущее
                </button>
              </div>
            </div>

            {/* Trim end */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-400">Конец монтажа</label>
                <span className="text-red-400 font-mono">{formatTime(trimEnd)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={trimStart}
                  max={videoDuration}
                  step={0.033}
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                  className="flex-1 accent-red-500"
                />
                <button onClick={() => { setTrimEnd(currentTime); }} className="text-xs bg-red-600/30 text-red-300 px-2 py-1 rounded hover:bg-red-600/50 transition-colors">
                  Текущее
                </button>
              </div>
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={submitJob}
            disabled={isSubmitting || !selectedDriver}
            className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition-all text-lg"
          >
            {isSubmitting ? 'Загрузка и обработка...' : 'Отправить на обработку'}
          </button>
          {!selectedDriver && (
            <p className="text-yellow-500 text-sm text-center">Сначала выберите гонщика выше</p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### Task 9: Frontend — Jobs list and modal

**Files:**
- Create: `race-time-front/src/app/parse/components/JobsSection.tsx`
- Create: `race-time-front/src/app/parse/components/JobModal.tsx`

**Step 1: Create JobModal**

```tsx
// JobModal.tsx
'use client';
import { useParseStore } from '../store/useParseStore';

export function JobModal() {
  const { selectedJob, isModalOpen, closeJobModal } = useParseStore();

  if (!isModalOpen || !selectedJob) return null;

  const statusColors = {
    pending: 'text-yellow-400 bg-yellow-500/10',
    processing: 'text-blue-400 bg-blue-500/10',
    done: 'text-green-400 bg-green-500/10',
    error: 'text-red-400 bg-red-500/10',
  };

  const statusLabels = {
    pending: 'В очереди',
    processing: 'Обработка...',
    done: 'Готово',
    error: 'Ошибка',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={closeJobModal}>
      <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-white font-bold text-lg">Детали задачи</h3>
          <button onClick={closeJobModal} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${statusColors[selectedJob.status]}`}>
              {statusLabels[selectedJob.status]}
            </span>
          </div>

          <div>
            <label className="text-gray-500 text-xs uppercase">URL заезда</label>
            <p className="text-gray-300 text-sm break-all">{selectedJob.raceUrl}</p>
          </div>

          <div>
            <label className="text-gray-500 text-xs uppercase">Гонщик</label>
            <p className="text-white">{selectedJob.driverName}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-gray-500 text-xs uppercase">Offset</label>
              <p className="text-white font-mono">{selectedJob.offset.toFixed(2)}s</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs uppercase">Trim start</label>
              <p className="text-white font-mono">{selectedJob.trimStart.toFixed(2)}s</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs uppercase">Trim end</label>
              <p className="text-white font-mono">{selectedJob.trimEnd.toFixed(2)}s</p>
            </div>
          </div>

          {selectedJob.errorMessage && (
            <div>
              <label className="text-gray-500 text-xs uppercase">Ошибка</label>
              <p className="text-red-400 text-sm">{selectedJob.errorMessage}</p>
            </div>
          )}

          <div>
            <label className="text-gray-500 text-xs uppercase">Создано</label>
            <p className="text-gray-300 text-sm">{new Date(selectedJob.createdAt).toLocaleString('ru-RU')}</p>
          </div>

          {selectedJob.downloadUrl && (
            <a
              href={selectedJob.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold py-3 rounded-xl text-center transition-all"
            >
              Скачать видео
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create JobsSection**

```tsx
// JobsSection.tsx
'use client';
import { useEffect } from 'react';
import { useParseStore } from '../store/useParseStore';

export function JobsSection() {
  const { jobs, loadJobs, isLoadingJobs, openJobModal } = useParseStore();

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  const statusColors = {
    pending: 'border-yellow-500/30 bg-yellow-500/5',
    processing: 'border-blue-500/30 bg-blue-500/5',
    done: 'border-green-500/30 bg-green-500/5',
    error: 'border-red-500/30 bg-red-500/5',
  };

  const statusDots = {
    pending: 'bg-yellow-400',
    processing: 'bg-blue-400 animate-pulse',
    done: 'bg-green-400',
    error: 'bg-red-400',
  };

  const statusLabels = {
    pending: 'В очереди',
    processing: 'Обработка...',
    done: 'Готово',
    error: 'Ошибка',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Задачи обработки</h2>
        {isLoadingJobs && <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
      </div>

      {jobs.length === 0 ? (
        <p className="text-gray-500 text-center py-8">Нет задач</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => openJobModal(job)}
              className={`border rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors ${statusColors[job.status]}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusDots[job.status]}`} />
                  <div>
                    <span className="text-white font-medium">{job.driverName}</span>
                    <span className="text-gray-500 text-sm ml-3">{statusLabels[job.status]}</span>
                  </div>
                </div>
                <span className="text-gray-500 text-sm">
                  {new Date(job.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Task 10: Frontend — Assemble page and add navigation

**Files:**
- Create: `race-time-front/src/app/parse/page.tsx`
- Modify: `race-time-front/src/app/page.tsx`

**Step 1: Create parse page**

```tsx
// parse/page.tsx
'use client';
import { RaceParserSection } from './components/RaceParserSection';
import { VideoEditorSection } from './components/VideoEditorSection';
import { JobsSection } from './components/JobsSection';
import { JobModal } from './components/JobModal';
import Link from 'next/link';

export default function ParsePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              🏁
            </div>
            <span className="text-white font-bold">Ace of Pace</span>
          </Link>
          <h1 className="text-gray-400 text-sm">Парсинг и монтаж</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <RaceParserSection />
        <div className="border-t border-white/10" />
        <VideoEditorSection />
        <div className="border-t border-white/10" />
        <JobsSection />
      </main>

      <JobModal />
    </div>
  );
}
```

**Step 2: Add link to /parse from home page**

Add a third button in the action buttons section of `race-time-front/src/app/page.tsx`, after the "Режим волны" link:

```tsx
<Link
  href="/parse"
  className="group inline-flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all duration-300 border border-white/20 hover:border-white/40"
>
  <span className="text-2xl">🎬</span>
  <span>Парсинг и монтаж</span>
</Link>
```

---

### Task 11: Add NEXT_PUBLIC_API_URL env variable to frontend

**Files:**
- Create: `race-time-front/.env.local` (user creates manually)

User needs to create `race-time-front/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

### Summary of all new files

**Backend (telegram-race-timer):**
1. `src/domains/video-jobs/video-job.entity.ts` — TypeORM entity
2. `src/domains/video-jobs/video-jobs.service.ts` — S3 presign, CRUD, background processing
3. `src/domains/video-jobs/video-jobs.controller.ts` — REST endpoints
4. `src/domains/video-jobs/video-jobs.module.ts` — NestJS module
5. `src/domains/video-jobs/dto/create-video-job.dto.ts` — Create DTO
6. `src/domains/video-jobs/dto/video-job-response.dto.ts` — Response DTO

**Modified backend:**
7. `src/app.module.ts` — Add TypeORM config
8. `src/domains/domains.module.ts` — Import VideoJobsModule
9. `src/domains/remotion/remotion.service.ts` — Add renderWithSourceVideo method

**Remotion:**
10. `src/RaceOverlayWithVideo.tsx` — New composition with source video
11. `src/types.ts` — Add RaceOverlayWithVideoProps
12. `src/Root.tsx` — Register new composition

**Frontend (race-time-front):**
13. `src/app/parse/page.tsx` — Main page
14. `src/app/parse/types.ts` — TypeScript types
15. `src/app/parse/store/useParseStore.ts` — Zustand store
16. `src/app/parse/components/RaceParserSection.tsx` — URL input + driver selector + stats
17. `src/app/parse/components/DriverStats.tsx` — Stats display like Telegram
18. `src/app/parse/components/VideoEditorSection.tsx` — Video player + sliders + submit
19. `src/app/parse/components/JobsSection.tsx` — Jobs list with polling
20. `src/app/parse/components/JobModal.tsx` — Job details modal

**Modified frontend:**
21. `src/app/page.tsx` — Add navigation link

**Dependencies to install:**
- `@aws-sdk/s3-request-presigner` in telegram-race-timer
