import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { SmtTimingGateway } from './sms-timing.gateway';
import { SmtTimingParser } from './sms-timing.parser';

@Module({
  imports: [TimingModule],
  providers: [SmtTimingGateway, SmtTimingParser],
})
export class SmtTimingModule {}
