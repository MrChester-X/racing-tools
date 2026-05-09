import { MigrationInterface, QueryRunner } from 'typeorm';

export class PitRooms1776629602751 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table "pit_rooms" (
        id uuid primary key default gen_random_uuid(),
        name varchar not null,
        "ownerSessionId" varchar null,
        "ownerNickname" varchar null,
        data jsonb not null default '{}'::jsonb,
        "createdAt" timestamptz not null default now(),
        "updatedAt" timestamptz not null default now()
      )
    `);

    await queryRunner.query(`alter table "pit_rooms" enable row level security`);
    await queryRunner.query(`
      create policy "pit_rooms public rw" on "pit_rooms"
      for all to anon
      using (true)
      with check (true)
    `);

    await queryRunner.query(`alter publication supabase_realtime add table "pit_rooms"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter publication supabase_realtime drop table "pit_rooms"`);
    await queryRunner.query(`drop policy if exists "pit_rooms public rw" on "pit_rooms"`);
    await queryRunner.query(`drop table if exists "pit_rooms"`);
  }
}
