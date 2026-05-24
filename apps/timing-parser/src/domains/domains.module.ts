import { Module } from '@nestjs/common';
import { TimingModule } from './timing/timing.module';
import { SmtTimingModule } from './sms-timing/sms-timing.module';
import { RacemannModule } from './racemann/racemann.module';
import { GetraceresultsModule } from './getraceresults/getraceresults.module';

@Module({
  imports: [TimingModule, SmtTimingModule, RacemannModule, GetraceresultsModule],
})
export class DomainsModule {}
