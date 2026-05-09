import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainsModule } from './domains/domains.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const useSsl = config.get<string>('DB_SSL') !== 'false';
        return {
          type: 'postgres',
          host: config.get('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get('DB_USERNAME', 'postgres'),
          password: config.get('DB_PASSWORD', 'postgres'),
          database: config.get('DB_DATABASE', 'postgres'),
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: config.get<string>('DB_MIGRATIONS_RUN') === 'true',
          migrations: [__dirname + '/migrations/*.{ts,js}'],
          ssl: useSsl ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    DomainsModule,
  ],
})
export class AppModule {}
