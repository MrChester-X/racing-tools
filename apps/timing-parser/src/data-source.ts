import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { Heat, Lap, RawMessage } from '@racing/shared';

loadEnv();

const useSsl = process.env.DB_SSL !== 'false';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'postgres',
  entities: [Heat, Lap, RawMessage],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
