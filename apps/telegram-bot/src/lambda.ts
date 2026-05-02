import { configure } from '@vendia/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { AppModule } from './app.module';

let cachedHandler: ReturnType<typeof configure>;

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn', 'log'],
  });
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  await app.init();
  return configure({ app: expressApp });
}

export const handler = async (event: unknown, context: unknown, callback: unknown) => {
  if (!cachedHandler) cachedHandler = await bootstrap();
  return cachedHandler(event as never, context as never, callback as never);
};
