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

  @ApiProperty({ example: 612.5 })
  @IsNumber()
  @IsOptional()
  videoDurationSec?: number;

  @ApiProperty({ example: 4523 })
  @IsNumber()
  @IsOptional()
  uploadDurationMs?: number;

  @ApiProperty({ example: 'videos/input-abc123.mp4' })
  @IsString()
  sourceVideoS3Key: string;

  @ApiProperty({ required: false })
  @IsOptional()
  raceData?: any;
}
