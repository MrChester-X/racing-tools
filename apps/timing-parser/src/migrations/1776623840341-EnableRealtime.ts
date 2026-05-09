import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableRealtime1776623840341 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table "heats" enable row level security`);
    await queryRunner.query(`alter table "laps"  enable row level security`);

    await queryRunner.query(`
      create policy "public read heats" on "heats"
      for select to anon using (true)
    `);
    await queryRunner.query(`
      create policy "public read laps" on "laps"
      for select to anon using (true)
    `);

    await queryRunner.query(`alter publication supabase_realtime add table "heats"`);
    await queryRunner.query(`alter publication supabase_realtime add table "laps"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter publication supabase_realtime drop table "laps"`);
    await queryRunner.query(`alter publication supabase_realtime drop table "heats"`);

    await queryRunner.query(`drop policy if exists "public read laps"  on "laps"`);
    await queryRunner.query(`drop policy if exists "public read heats" on "heats"`);

    await queryRunner.query(`alter table "laps"  disable row level security`);
    await queryRunner.query(`alter table "heats" disable row level security`);
  }
}
