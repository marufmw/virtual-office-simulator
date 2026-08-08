import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The office becomes offices: people sign in with Google, an admin owns a
 * floor plan, and seats are handed out by email.
 *
 * The single anonymous office that came before had no owner and no way to
 * grow one, so it is dropped rather than migrated — its desks belonged to
 * names typed into a browser, and there is nobody to hand them to.
 */
export class OfficesAndAccounts1754700000000 implements MigrationInterface {
  name = "OfficesAndAccounts1754700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS players`);
    await queryRunner.query(`DROP TABLE IF EXISTS room`);
    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS boards`);
    await queryRunner.query(`DROP TABLE IF EXISTS desks`);

    await queryRunner.query(`
      CREATE TABLE users (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email      TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL,
        picture    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE offices (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       TEXT NOT NULL,
        min_x      DOUBLE PRECISION NOT NULL,
        max_x      DOUBLE PRECISION NOT NULL,
        min_y      DOUBLE PRECISION NOT NULL,
        max_y      DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Written before the person has ever signed in, so it points at an
    // email rather than at a user row
    await queryRunner.query(`
      CREATE TABLE memberships (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        office_id  UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
        email      TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX memberships_office_email ON memberships (office_id, email)`
    );
    await queryRunner.query(`CREATE INDEX memberships_email ON memberships (email)`);

    await queryRunner.query(`
      CREATE TABLE desks (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        office_id      UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
        code           TEXT NOT NULL,
        x              DOUBLE PRECISION NOT NULL,
        y              DOUBLE PRECISION NOT NULL,
        assigned_email TEXT,
        "character"    TEXT,
        stand_x        DOUBLE PRECISION,
        stand_y        DOUBLE PRECISION
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX desks_office_code ON desks (office_id, code)`);
    // One desk per person: the seating chart can't sit somebody twice
    await queryRunner.query(
      `CREATE UNIQUE INDEX desks_office_email ON desks (office_id, assigned_email)
         WHERE assigned_email IS NOT NULL`
    );

    await queryRunner.query(`
      CREATE TABLE messages (
        id         BIGSERIAL PRIMARY KEY,
        office_id  UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
        from_email TEXT NOT NULL,
        to_email   TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX messages_pair ON messages (office_id, from_email, to_email, created_at)`
    );

    await queryRunner.query(`
      CREATE TABLE boards (
        office_id  UUID PRIMARY KEY REFERENCES offices(id) ON DELETE CASCADE,
        scene      JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS boards`);
    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS desks`);
    await queryRunner.query(`DROP TABLE IF EXISTS memberships`);
    await queryRunner.query(`DROP TABLE IF EXISTS offices`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
