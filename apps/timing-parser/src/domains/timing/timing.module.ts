import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Heat, Lap, RawMessage } from '@racing/shared';
import { TimingService } from './timing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Heat, Lap, RawMessage])],
  providers: [TimingService],
  exports: [TimingService],
})
export class TimingModule {}
