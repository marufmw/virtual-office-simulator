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
  )
`);

// Seed the office: desks and their assigned users. Anything not in
// these lists is wiped on startup.
const SEED = [
  { deskId: "TB-113", name: "madhurja" },
  { deskId: "TB-057", name: "Siam" },
  { deskId: "TB-110", name: "Maruf" },
  { deskId: "TB-109", name: "Rashed" },
  { deskId: "TB-107", name: "Asad" },
];

const SEED_CHARACTERS = [
  "office_man_black_suit",
  "office_man_green",
  "office_man_white_shirt",
  "office_man_gray",
  "office_man_dark_red",
];

const SPAWN_OFFSET_Y = -1.6; // players appear just in front of their desk

// Desk layout: rows of 3, 8 units apart
const upsertDesk = db.prepare("INSERT OR REPLACE INTO desks (id, x, y) VALUES (?, ?, ?)");
const seedDeskPos = (i) => ({ x: (i % 3) * 8 - 8, y: Math.floor(i / 3) * 8 - 4 });
SEED.forEach(({ deskId }, i) => {
  const { x, y } = seedDeskPos(i);
  upsertDesk.run(deskId, x, y);
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
SEED.forEach(({ deskId, name }, i) => {
  if (!getStmt.get(deskId)) {
    const { x, y } = seedDeskPos(i);
    insertStmt.run(deskId, name, SEED_CHARACTERS[i % SEED_CHARACTERS.length], x, y + SPAWN_OFFSET_Y);
  }
});

const updatePosStmt = db.prepare("UPDATE players SET x = ?, y = ? WHERE desk_id = ?");

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
