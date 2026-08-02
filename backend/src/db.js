const { Pool } = require("pg");

// Everything here is async: Postgres is over a socket, so every call the
// server makes into this module has to be awaited.
const CONNECTION_STRING = process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  throw new Error("DATABASE_URL is not set — the office has nowhere to keep its state");
}

// Render's managed Postgres terminates TLS on the public hostname; the
// internal one inside the private network doesn't need it.
const needsSsl =
  process.env.DATABASE_SSL === "true" || /\.render\.com(:\d+)?\//.test(`${CONNECTION_STRING}/`);

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
});

pool.on("error", (error) => console.error("Postgres pool error:", error));

const query = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] ?? null;
const all = async (text, params) => (await pool.query(text, params)).rows;

// `character` is a type name in SQL, so the column is quoted everywhere
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS desks (
    id    TEXT PRIMARY KEY,
    x     DOUBLE PRECISION NOT NULL,
    y     DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    desk_id     TEXT PRIMARY KEY REFERENCES desks(id),
    name        TEXT NOT NULL,
    "character" TEXT NOT NULL,
    x           DOUBLE PRECISION NOT NULL DEFAULT 0,
    y           DOUBLE PRECISION NOT NULL DEFAULT 0
  );

  -- The room's wall centrelines. One row, grown as desks are dragged out.
  CREATE TABLE IF NOT EXISTS room (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    min_x DOUBLE PRECISION NOT NULL,
    max_x DOUBLE PRECISION NOT NULL,
    min_y DOUBLE PRECISION NOT NULL,
    max_y DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         BIGSERIAL PRIMARY KEY,
    from_desk  TEXT NOT NULL,
    to_desk    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS messages_pair
    ON messages (from_desk, to_desk, created_at);

  -- What's drawn on a whiteboard, as the Excalidraw element array. One row
  -- per board; the office has one, but nothing here assumes that.
  CREATE TABLE IF NOT EXISTS boards (
    id         TEXT PRIMARY KEY,
    scene      JSONB NOT NULL,
    updated_at BIGINT NOT NULL
  );
`;

// Seed the office: the real floor plan, as a grid of [column, row].
// Columns are 4 units apart, the three desk rows sit at ROW_Y.
// Desks with a `name` get that user seeded; the rest stay free
// (anonymous) for whoever joins first.
// The office as it stands: every desk where it actually sits, and who sits
// at it. Captured from the live floor plan rather than described by a grid,
// because the plan has been rearranged by hand since and a grid can no
// longer express it.
//
// A seat with a name belongs to that person and is recreated with them on
// it; the rest are free for whoever walks in first. This is also what
// `resetLayout` puts the office back to.
const SEED = [
  // back row
  { deskId: "TB-046", x: -17, y: 5 },
  { deskId: "TB-137", x: -13, y: 5 },
  { deskId: "TB-113", x: -5, y: 5, name: "Sidul", character: "office_man_green" },
  { deskId: "TB-057", x: -1, y: 5, name: "Siam", character: "office_man_gray" },
  { deskId: "TB-110", x: 3, y: 5, name: "Maruf", character: "office_man_white_shirt" },
  { deskId: "TB-109", x: 7, y: 5, name: "Rashed", character: "office_man_green" },
  { deskId: "TB-108", x: 11, y: 5, name: "Sidul", character: "office_man_green" },
  { deskId: "TB-107", x: 15, y: 5, name: "Asad", character: "office_man_white_shirt" },
  // middle row
  { deskId: "TB-042", x: -9, y: -3 },
  { deskId: "TB-073", x: -5, y: -3 },
  { deskId: "TB-043", x: -1, y: -3 },
  { deskId: "TB-136", x: 3, y: -3 },
  { deskId: "TB-112", x: 7, y: -3 },
  { deskId: "TB-111", x: 11, y: -3 },
  { deskId: "TB-045", x: 17, y: -3 },
  { deskId: "TB-142", x: 21, y: -3 },
  // front row
  { deskId: "TB-114", x: -17, y: -7 },
  { deskId: "TB-105", x: -7, y: -7 },
  { deskId: "TB-041", x: -3, y: -7 },
  { deskId: "TB-040", x: 1, y: -7 },
  { deskId: "TB-005", x: 5, y: -7 },
  { deskId: "TB-044", x: 17, y: -7 },
];

const DEFAULT_CHARACTER = "office_man_white_shirt";
const SPAWN_OFFSET_Y = -1.6; // players appear just in front of their desk

// The walls as they currently stand
const DEFAULT_ROOM = { minX: -22, maxX: 26, minY: -14, maxY: 12 };


const saveRoom = async (room) => {
  await query(
    `INSERT INTO room (id, min_x, max_x, min_y, max_y) VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET min_x = $1, max_x = $2, min_y = $3, max_y = $4`,
    [room.minX, room.maxX, room.minY, room.maxY]
  );
  return room;
};

const getRoom = async () => {
  const row = await one("SELECT * FROM room WHERE id = 1");
  return row ? { minX: row.min_x, maxX: row.max_x, minY: row.min_y, maxY: row.max_y } : null;
};

/**
 * Lays out the seed office. Only runs against an empty room — once the
 * floor plan has been edited, the database is the truth and nothing here
 * overwrites it. `resetLayout` calls this again after clearing the room.
 */
async function seedOffice() {
  for (const seat of SEED) {
    await query(
      `INSERT INTO desks (id, x, y) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET x = $2, y = $3`,
      [seat.deskId, seat.x, seat.y]
    );
    if (!seat.name) continue;
    await query(
      `INSERT INTO players (desk_id, name, "character", x, y) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (desk_id) DO NOTHING`,
      [
        seat.deskId,
        seat.name,
        seat.character ?? DEFAULT_CHARACTER,
        seat.x,
        seat.y + SPAWN_OFFSET_Y,
      ]
    );
  }
}

/**
 * Creates the tables and lays out the office if this is a fresh database.
 * Must finish before the server starts taking connections.
 */
async function init() {
  await query(SCHEMA);
  const { n } = await one("SELECT COUNT(*)::int AS n FROM desks");
  if (n === 0) await seedOffice();
  if (!(await getRoom())) await saveRoom(DEFAULT_ROOM);
}

module.exports = {
  init,
  close: () => pool.end(),

  getPlayer: (deskId) => one(`SELECT * FROM players WHERE desk_id = $1`, [deskId]),

  createPlayer: async (deskId, name, character, x, y) => {
    await query(
      `INSERT INTO players (desk_id, name, "character", x, y) VALUES ($1, $2, $3, $4, $5)`,
      [deskId, name, character, x, y]
    );
    return { desk_id: deskId, name, character, x, y };
  },

  savePosition: (deskId, x, y) =>
    query("UPDATE players SET x = $1, y = $2 WHERE desk_id = $3", [x, y, deskId]),

  updateProfile: (oldDeskId, { deskId, name, character }) =>
    query(
      `UPDATE players SET desk_id = $1, name = $2, "character" = $3 WHERE desk_id = $4`,
      [deskId, name, character, oldDeskId]
    ),

  loadPlayers: () => all("SELECT * FROM players"),

  // Empties a seat: the desk stays, the person on it doesn't. Their chat
  // history goes with them — it was keyed to a desk they no longer hold,
  // and leaving it would hand it to whoever sits there next.
  clearSeat: async (deskId) => {
    await query("DELETE FROM messages WHERE from_desk = $1 OR to_desk = $1", [deskId]);
    await query("DELETE FROM players WHERE desk_id = $1", [deskId]);
  },

  saveMessage: (fromDesk, toDesk, body, createdAt) =>
    query(
      "INSERT INTO messages (from_desk, to_desk, body, created_at) VALUES ($1, $2, $3, $4)",
      [fromDesk, toDesk, body, createdAt]
    ),

  // Full chat history between two desks, oldest first
  loadConversation: async (deskA, deskB) =>
    (
      await all(
        `SELECT from_desk, to_desk, body, created_at
           FROM messages
          WHERE (from_desk = $1 AND to_desk = $2) OR (from_desk = $2 AND to_desk = $1)
          ORDER BY created_at, id`,
        [deskA, deskB]
      )
    ).map((m) => ({
      fromDesk: m.from_desk,
      toDesk: m.to_desk,
      body: m.body,
      // bigint comes back as a string; timestamps are numbers on the wire
      createdAt: Number(m.created_at),
    })),

  // --- The whiteboard ---

  loadBoard: async (id) => {
    const row = await one("SELECT scene FROM boards WHERE id = $1", [id]);
    return row ? row.scene : [];
  },

  saveBoard: (id, scene, updatedAt) =>
    query(
      `INSERT INTO boards (id, scene, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET scene = $2, updated_at = $3`,
      [id, JSON.stringify(scene), updatedAt]
    ),

  getDesk: (id) => one("SELECT * FROM desks WHERE id = $1", [id]),

  loadDesks: () => all("SELECT * FROM desks"),

  // --- The room ---

  getRoom,
  saveRoom,
  DEFAULT_ROOM,

  // --- Floor plan editing ---

  addDesk: async (id, x, y) => {
    await query("INSERT INTO desks (id, x, y) VALUES ($1, $2, $3)", [id, x, y]);
    return { id, x, y };
  },

  // Moves the furniture. The occupant, if any, is carried along and left
  // standing in front of it.
  moveDesk: async (id, x, y) => {
    await query("UPDATE desks SET x = $1, y = $2 WHERE id = $3", [x, y, id]);
    const occupant = await one("SELECT * FROM players WHERE desk_id = $1", [id]);
    if (occupant) {
      await query("UPDATE players SET x = $1, y = $2 WHERE desk_id = $3", [x, y + SPAWN_OFFSET_Y, id]);
    }
    return { id, x, y, occupant: occupant ?? null };
  },

  removeDesk: async (id) => {
    await query("DELETE FROM messages WHERE from_desk = $1 OR to_desk = $1", [id]);
    await query("DELETE FROM players WHERE desk_id = $1", [id]);
    await query("DELETE FROM desks WHERE id = $1", [id]);
  },

  // Sits an existing person at a different desk, keeping their name,
  // character and chat history (which is keyed on the desk they sat at).
  reseatPlayer: async (fromDeskId, toDeskId) => {
    const player = await one("SELECT * FROM players WHERE desk_id = $1", [fromDeskId]);
    const desk = await one("SELECT * FROM desks WHERE id = $1", [toDeskId]);
    if (!player || !desk) return null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE players SET desk_id = $1, x = $2, y = $3 WHERE desk_id = $4",
        [toDeskId, desk.x, desk.y + SPAWN_OFFSET_Y, fromDeskId]
      );
      await client.query("UPDATE messages SET from_desk = $1 WHERE from_desk = $2", [
        toDeskId,
        fromDeskId,
      ]);
      await client.query("UPDATE messages SET to_desk = $1 WHERE to_desk = $2", [
        toDeskId,
        fromDeskId,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { ...player, desk_id: toDeskId, x: desk.x, y: desk.y + SPAWN_OFFSET_Y };
  },

  /**
   * Trades two people's desks. Both the seat and the chat history follow
   * the person, so a swap is invisible to their conversations.
   *
   * desk_id is the players table's primary key and a foreign key into
   * desks, so the two rows are removed and re-inserted inside one
   * transaction rather than updated through a placeholder seat.
   */
  swapSeats: async (deskA, deskB) => {
    const a = await one("SELECT * FROM players WHERE desk_id = $1", [deskA]);
    const b = await one("SELECT * FROM players WHERE desk_id = $1", [deskB]);
    const posA = await one("SELECT * FROM desks WHERE id = $1", [deskA]);
    const posB = await one("SELECT * FROM desks WHERE id = $1", [deskB]);
    if (!a || !b || !posA || !posB) return null;

    const SENTINEL = " swap"; // no real desk id can start with a space (desk codes must begin with a letter or digit)
    const rekey = async (client, column) => {
      const set = (to, from) =>
        client.query(`UPDATE messages SET ${column} = $1 WHERE ${column} = $2`, [to, from]);
      await set(SENTINEL, deskA);
      await set(deskA, deskB);
      await set(deskB, SENTINEL);
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM players WHERE desk_id IN ($1, $2)", [deskA, deskB]);
      await client.query(
        `INSERT INTO players (desk_id, name, "character", x, y) VALUES ($1, $2, $3, $4, $5)`,
        [deskA, b.name, b.character, posA.x, posA.y + SPAWN_OFFSET_Y]
      );
      await client.query(
        `INSERT INTO players (desk_id, name, "character", x, y) VALUES ($1, $2, $3, $4, $5)`,
        [deskB, a.name, a.character, posB.x, posB.y + SPAWN_OFFSET_Y]
      );
      await rekey(client, "from_desk");
      await rekey(client, "to_desk");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return {
      [deskA]: { ...b, desk_id: deskA, x: posA.x, y: posA.y + SPAWN_OFFSET_Y },
      [deskB]: { ...a, desk_id: deskB, x: posB.x, y: posB.y + SPAWN_OFFSET_Y },
    };
  },

  // Throws the room away and lays out the seed office again
  resetLayout: async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM messages");
      await client.query("DELETE FROM players");
      await client.query("DELETE FROM desks");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await saveRoom(DEFAULT_ROOM);
    await seedOffice();
  },

  // Desks with a flag showing whether a player record occupies them
  loadDesksWithStatus: () =>
    all(
      `SELECT d.id, d.x, d.y, p.name AS occupant, p."character" AS occupant_character
         FROM desks d LEFT JOIN players p ON p.desk_id = d.id`
    ),
};
