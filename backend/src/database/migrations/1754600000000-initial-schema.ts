import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The office as it was before NestJS, table for table.
 *
 * Written with IF NOT EXISTS throughout because this migration also has to
 * run against the database that is already live — it finds everything in
 * place, records itself, and changes nothing.
 */
export class InitialSchema1754600000000 implements MigrationInterface {
  name = "InitialSchema1754600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `character` is a type name in SQL, so the column is quoted everywhere
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS desks (
        id    TEXT PRIMARY KEY,
        x     DOUBLE PRECISION NOT NULL,
        y     DOUBLE PRECISION NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS players (
        desk_id     TEXT PRIMARY KEY REFERENCES desks(id),
        name        TEXT NOT NULL,
        "character" TEXT NOT NULL,
        x           DOUBLE PRECISION NOT NULL DEFAULT 0,
        y           DOUBLE PRECISION NOT NULL DEFAULT 0
      )
    `);

    // The room's wall centrelines. One row, grown as desks are dragged out.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS room (
        id    INTEGER PRIMARY KEY CHECK (id = 1),
        min_x DOUBLE PRECISION NOT NULL,
        max_x DOUBLE PRECISION NOT NULL,
        min_y DOUBLE PRECISION NOT NULL,
        max_y DOUBLE PRECISION NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id         BIGSERIAL PRIMARY KEY,
        from_desk  TEXT NOT NULL,
        to_desk    TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS messages_pair
        ON messages (from_desk, to_desk, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS boards (
        id         TEXT PRIMARY KEY,
        scene      JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS boards`);
    await queryRunner.query(`DROP INDEX IF EXISTS messages_pair`);
    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS room`);
    await queryRunner.query(`DROP TABLE IF EXISTS players`);
    await queryRunner.query(`DROP TABLE IF EXISTS desks`);
  }
}
