import { TelegrafModuleOptions } from 'nestjs-telegraf';
import { registerAs } from '@nestjs/config';
import * as process from 'node:process';

export default registerAs<TelegrafModuleOptions>('telegraf', () => {
  if (!process.env.TELEGRAM_TOKEN)
    throw new Error('TELEGRAM_TOKEN not found in env');

  return {
    token: process.env.TELEGRAM_TOKEN,
    launchOptions: false,
  };
});
