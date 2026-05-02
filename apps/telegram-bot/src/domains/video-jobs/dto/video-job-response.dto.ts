import { ApiProperty } from '@nestjs/swagger';
import { VideoJobStatus } from '../video-job.entity';

export class VideoJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  raceUrl: string;

  @ApiProperty({ required: false })
  raceName?: string;

  @ApiProperty()
  driverName: string;

  @ApiProperty()
  offset: number;

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
  videoDurationSec?: number | null;

  @ApiProperty({ required: false })
  renderDurationMs?: number | null;

  @ApiProperty({ required: false })
  downloadUrl?: string;

  @ApiProperty({ required: false })
  sourceDownloadUrl?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
