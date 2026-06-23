import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { GrrLiveGateway } from './getraceresults-live.gateway';

// NB: GrrLiveParser is intentionally NOT a provider — it's instantiated manually
// per track inside GrrLiveGateway (with track-specific options), not via DI.
@Module({
  imports: [TimingModule],
  providers: [GrrLiveGateway],
})
export class GetraceresultsModule {}
