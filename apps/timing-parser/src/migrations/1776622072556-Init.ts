import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1776622072556 implements MigrationInterface {
    name = 'Init1776622072556'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "laps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driverName" character varying NOT NULL, "kart" character varying NOT NULL, "position" integer NOT NULL, "lapCount" integer NOT NULL, "time" integer NOT NULL, "driverExternalId" integer NOT NULL, "meta" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "passAt" TIMESTAMP WITH TIME ZONE, "heatId" uuid, CONSTRAINT "PK_2ef05004e276318aa254bca4901" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f077c72747d9178d0e2a6dc3e8" ON "laps" ("heatId", "driverExternalId", "lapCount") `);
        await queryRunner.query(`CREATE TYPE "public"."heats_status_enum" AS ENUM('waiting', 'inProgress', 'finished', 'unknown')`);
        await queryRunner.query(`CREATE TABLE "heats" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kartodromId" character varying NOT NULL, "scheduledTimestamp" integer NOT NULL, "name" character varying NOT NULL, "status" "public"."heats_status_enum" NOT NULL DEFAULT 'unknown', "meta" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "passAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_16766477210388b685aea134838" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_777da1aa28c798f4e65ebad1ab" ON "heats" ("kartodromId", "scheduledTimestamp", "name") `);
        await queryRunner.query(`CREATE TABLE "raw_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kartodromId" character varying NOT NULL, "data" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d4a50de11550b657fe3d8b04171" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "laps" ADD CONSTRAINT "FK_aaa6b7a928d7dbc29d84b9b6253" FOREIGN KEY ("heatId") REFERENCES "heats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "laps" DROP CONSTRAINT "FK_aaa6b7a928d7dbc29d84b9b6253"`);
        await queryRunner.query(`DROP TABLE "raw_messages"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_777da1aa28c798f4e65ebad1ab"`);
        await queryRunner.query(`DROP TABLE "heats"`);
        await queryRunner.query(`DROP TYPE "public"."heats_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f077c72747d9178d0e2a6dc3e8"`);
        await queryRunner.query(`DROP TABLE "laps"`);
    }

}
