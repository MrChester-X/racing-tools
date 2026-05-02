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
