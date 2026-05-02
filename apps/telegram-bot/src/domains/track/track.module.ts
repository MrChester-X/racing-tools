import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Track } from './entity/track.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Track])],
})
export class TrackModule {}
