import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atomic, scoped color update for pit rooms. Lets a viewer (no race control)
 * change a single kart's color without ever overwriting the owner's events /
 * pitlane: the function merges only data.kartColors.<kart> server-side.
 */
export class PitRoomKartColorRpc1776700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create or replace function pitroom_set_kart_color(room_id uuid, kart text, color int)
      returns void
      language sql
      as $$
        update pit_rooms
        set data = jsonb_set(
              coalesce(data, '{}'::jsonb),
              array['kartColors', kart],
              to_jsonb(color),
              true
            ),
            "updatedAt" = now()
        where id = room_id;
      $$;
    `);

    await queryRunner.query(
      `grant execute on function pitroom_set_kart_color(uuid, text, int) to anon, authenticated`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop function if exists pitroom_set_kart_color(uuid, text, int)`);
  }
}
