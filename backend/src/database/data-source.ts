import { DataSourceOptions } from "typeorm";

import { Board } from "./entities/board.entity";
import { Desk } from "./entities/desk.entity";
import { Message } from "./entities/message.entity";
import { Player } from "./entities/player.entity";
import { RoomRow } from "./entities/room.entity";
import { InitialSchema1754600000000 } from "./migrations/1754600000000-initial-schema";

export const ENTITIES = [Desk, Player, RoomRow, Message, Board];

/**
 * How we reach Postgres. The schema is owned by migrations rather than by
 * `synchronize` — the office runs against a database that already holds
 * everyone's desks, and nothing here may quietly rewrite it.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — the office has nowhere to keep its state");
  }

  // Render's managed Postgres terminates TLS on the public hostname; the
  // internal one inside the private network doesn't need it.
  const needsSsl = process.env.DATABASE_SSL === "true" || /\.render\.com(:\d+)?\//.test(`${url}/`);

  return {
    type: "postgres",
    url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    extra: { max: Number(process.env.DATABASE_POOL_MAX) || 10 },
    entities: ENTITIES,
    migrations: [InitialSchema1754600000000],
    migrationsRun: true,
    synchronize: false,
    logging: process.env.DATABASE_LOGGING === "true",
  };
}
