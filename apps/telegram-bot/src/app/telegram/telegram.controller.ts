import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Controller('telegram')
export class TelegramController {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() update: unknown) {
    await this.bot.handleUpdate(update as never);
    return { ok: true };
  }
}
