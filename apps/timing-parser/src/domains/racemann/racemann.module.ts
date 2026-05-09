import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { RacemannClient } from './racemann.client';
import { RacemannController } from './racemann.controller';
import { RacemannService } from './racemann.service';
import { RacemannLiveGateway } from './live/racemann-live.gateway';
import { RacemannLiveParser } from './live/racemann-live.parser';

@Module({
  imports: [TimingModule],
  controllers: [RacemannController],
  providers: [RacemannClient, RacemannService, RacemannLiveParser, RacemannLiveGateway],
})
export class RacemannModule {}
