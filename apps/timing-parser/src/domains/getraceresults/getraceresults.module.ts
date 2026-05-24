import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { GrrLiveGateway } from './getraceresults-live.gateway';
import { GrrLiveParser } from './getraceresults-live.parser';

@Module({
  imports: [TimingModule],
  providers: [GrrLiveParser, GrrLiveGateway],
})
export class GetraceresultsModule {}
