const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "office.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS desks (
    id    TEXT PRIMARY KEY,
    x     REAL NOT NULL,
    y     REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    desk_id   TEXT PRIMARY KEY REFERENCES desks(id),
    name      TEXT NOT NULL,
    character TEXT NOT NULL,
    x         REAL NOT NULL DEFAULT 0,
    y         REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_desk  TEXT NOT NULL,
    to_desk    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS messages_pair
    ON messages (from_desk, to_desk, created_at);
`);

// Seed the office: the real floor plan, as a grid of [column, row].
// Columns are 4 units apart, the three desk rows sit at ROW_Y.
// Desks with a `name` get that user seeded; the rest stay free
// (anonymous) for whoever joins first. Anything not listed here is
// wiped on startup.
const COLUMN_SPACING = 3.5; // keeps the outermost desks clear of the side walls
const COLUMN_CENTER = 5; // column index that maps to x = 0
const ROW_Y = { 0: 8, 1: -1, 2: -5.5 };

const SEED = [
  // back row
  { deskId: "TB-046", col: 0, row: 0 },
  { deskId: "TB-137", col: 1, row: 0 },
  { deskId: "TB-113", col: 4, row: 0, name: "madhurja" },
  { deskId: "TB-057", col: 5, row: 0, name: "Siam" },
  { deskId: "TB-110", col: 6, row: 0, name: "Maruf" },
  { deskId: "TB-109", col: 7, row: 0, name: "Rashed" },
  { deskId: "TB-108", col: 9, row: 0, name: "Sidul" },
  { deskId: "TB-107", col: 10, row: 0, name: "Asad" },
  // middle row
  { deskId: "TB-042", col: 3, row: 1 },
  { deskId: "TB-073", col: 4, row: 1 },
  { deskId: "TB-043", col: 5, row: 1 },
  { deskId: "TB-136", col: 6, row: 1 },
  { deskId: "TB-112", col: 7, row: 1 },
  { deskId: "TB-111", col: 8, row: 1 },
  { deskId: "TB-045", col: 9, row: 1 },
  { deskId: "TB-142", col: 10, row: 1 },
  // front row
  { deskId: "TB-114", col: 0, row: 2 },
  { deskId: "TB-105", col: 3, row: 2 },
  { deskId: "TB-041", col: 4, row: 2 },
  { deskId: "TB-040", col: 5, row: 2 },
  { deskId: "TB-005", col: 6, row: 2 },
  { deskId: "TB-044", col: 9, row: 2 },
];

const SEED_CHARACTERS = [
  "office_man_black_suit",
  "office_man_green",
  "office_man_white_shirt",
  "office_man_gray",
  "office_man_dark_red",
];

const SPAWN_OFFSET_Y = -1.6; // players appear just in front of their desk

const upsertDesk = db.prepare("INSERT OR REPLACE INTO desks (id, x, y) VALUES (?, ?, ?)");
const seedDeskPos = ({ col, row }) => ({
  x: (col - COLUMN_CENTER) * COLUMN_SPACING,
  y: ROW_Y[row],
});
SEED.forEach((seat) => {
  const { x, y } = seedDeskPos(seat);
  upsertDesk.run(seat.deskId, x, y);
});

// Remove desks and players that are not part of the seed
const placeholders = SEED.map(() => "?").join(", ");
db.prepare(`DELETE FROM players WHERE desk_id NOT IN (${placeholders})`).run(
  ...SEED.map((s) => s.deskId)
);
db.prepare(`DELETE FROM desks WHERE id NOT IN (${placeholders})`).run(
  ...SEED.map((s) => s.deskId)
);

// Seed the users (only if missing, so later changes survive restarts)
const getStmt = db.prepare("SELECT * FROM players WHERE desk_id = ?");
const insertStmt = db.prepare(
  "INSERT INTO players (desk_id, name, character, x, y) VALUES (?, ?, ?, ?, ?)"
);
SEED.forEach((seat, i) => {
  if (!seat.name || getStmt.get(seat.deskId)) return;
  const { x, y } = seedDeskPos(seat);
  insertStmt.run(
    seat.deskId,
    seat.name,
    SEED_CHARACTERS[i % SEED_CHARACTERS.length],
    x,
    y + SPAWN_OFFSET_Y
  );
});

const updatePosStmt = db.prepare("UPDATE players SET x = ?, y = ? WHERE desk_id = ?");

const insertMessageStmt = db.prepare(
  "INSERT INTO messages (from_desk, to_desk, body, created_at) VALUES (?, ?, ?, ?)"
);
// Both directions of a one-on-one conversation, oldest first
const conversationStmt = db.prepare(
  `SELECT from_desk, to_desk, body, created_at
     FROM messages
    WHERE (from_desk = ? AND to_desk = ?) OR (from_desk = ? AND to_desk = ?)
    ORDER BY created_at, id`
);

module.exports = {
  getPlayer: (deskId) => getStmt.get(deskId),

  createPlayer: (deskId, name, character, x, y) => {
    insertStmt.run(deskId, name, character, x, y);
    return { desk_id: deskId, name, character, x, y };
  },

  savePosition: (deskId, x, y) => updatePosStmt.run(x, y, deskId),

  updateProfile: (oldDeskId, { deskId, name, character }) =>
    db
      .prepare("UPDATE players SET desk_id = ?, name = ?, character = ? WHERE desk_id = ?")
      .run(deskId, name, character, oldDeskId),

  loadPlayers: () => db.prepare("SELECT * FROM players").all(),

  saveMessage: (fromDesk, toDesk, body, createdAt) =>
    insertMessageStmt.run(fromDesk, toDesk, body, createdAt),

  // Full chat history between two desks, oldest first
  loadConversation: (deskA, deskB) =>
    conversationStmt.all(deskA, deskB, deskB, deskA).map((m) => ({
      fromDesk: m.from_desk,
      toDesk: m.to_desk,
      body: m.body,
      createdAt: m.created_at,
    })),

  getDesk: (id) => db.prepare("SELECT * FROM desks WHERE id = ?").get(id),

  loadDesks: () => db.prepare("SELECT * FROM desks").all(),

  // Desks with a flag showing whether a player record occupies them
  loadDesksWithStatus: () =>
    db
      .prepare(
        `SELECT d.id, d.x, d.y, p.name AS occupant, p.character AS occupant_character
         FROM desks d LEFT JOIN players p ON p.desk_id = d.id`
      )
      .all(),
};
