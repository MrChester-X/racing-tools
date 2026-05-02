import { Controller, Get, Post, Patch, Body, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { VideoJobsService } from './video-jobs.service';
import { CreateVideoJobDto } from './dto/create-video-job.dto';
import { VideoJobResponseDto } from './dto/video-job-response.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User } from '../auth/user.entity';
import { UserRole } from '../auth/user-role.enum';

@ApiTags('Video Jobs')
@Controller('video-jobs')
export class VideoJobsController {
  constructor(private readonly videoJobsService: VideoJobsService) {}

  @Get('upload-url')
  @Auth()
  @ApiOperation({ summary: 'Get presigned URL for direct S3 upload' })
  async getUploadUrl(@CurrentUser() user: User) {
    await this.videoJobsService.checkDailyLimit(user);
    return this.videoJobsService.getPresignedUploadUrl();
  }

  @Post()
  @Auth()
  @ApiOperation({ summary: 'Create a new video processing job' })
  async create(@Body() dto: CreateVideoJobDto, @CurrentUser() user: User) {
    return this.videoJobsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List video jobs with pagination and optional user filter' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'archived', required: false, type: Boolean })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('archived') archived?: string,
  ) {
    return this.videoJobsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      userId: userId || undefined,
      archived: archived === 'true',
    });
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive a video job (admin only)' })
  async archive(@Param('id') id: string) {
    await this.videoJobsService.archive(id);
    return { success: true };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video job details with download URL' })
  async findOne(@Param('id') id: string): Promise<VideoJobResponseDto> {
    const job = await this.videoJobsService.findOne(id);
    if (!job) throw new NotFoundException('Job not found');
    const response: VideoJobResponseDto = { ...job };
    if (job.resultVideoS3Key) {
      if (job.resultVideoS3Key.startsWith('http')) {
        response.downloadUrl = job.resultVideoS3Key;
      } else {
        response.downloadUrl = await this.videoJobsService.getPresignedDownloadUrl(job.resultVideoS3Key);
      }
    }
    if (job.sourceVideoS3Key) {
      response.sourceDownloadUrl = await this.videoJobsService.getPresignedDownloadUrl(job.sourceVideoS3Key);
    }
    return response;
  }
}
