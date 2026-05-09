import { Module } from '@nestjs/common';
import { TimingModule } from './timing/timing.module';
import { SmtTimingModule } from './sms-timing/sms-timing.module';
import { RacemannModule } from './racemann/racemann.module';

@Module({
  imports: [TimingModule, SmtTimingModule, RacemannModule],
})
export class DomainsModule {}
