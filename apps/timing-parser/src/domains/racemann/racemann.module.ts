import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { RacemannClient } from './racemann.client';
import { RacemannController } from './racemann.controller';
import { RacemannService } from './racemann.service';
import { RacemannLiveGateway } from './live/racemann-live.gateway';

@Module({
  imports: [TimingModule],
  controllers: [RacemannController],
  providers: [RacemannClient, RacemannService, RacemannLiveGateway],
})
export class RacemannModule {}
