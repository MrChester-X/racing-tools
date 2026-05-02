import { Module } from '@nestjs/common';
// import { HandlerModule } from './handler/handler.module';
import { ParserModule } from './parser/parser.module';
import { VideoJobsModule } from './video-jobs/video-jobs.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [/* HandlerModule, */ ParserModule, VideoJobsModule, AuthModule],
})
export class DomainsModule {}
