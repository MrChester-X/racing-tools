import { Module } from '@nestjs/common';
import { TelegramModule } from '../../app/telegram/telegram.module';
import { HandlerController } from './handler.controller';
import { ParserModule } from '../parser/parser.module';
@Module({
  imports: [TelegramModule, ParserModule],
  providers: [HandlerController],
})
export class HandlerModule {}
