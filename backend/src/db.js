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

// Seed the office layout: 12 desks in a 4x3 grid
const DESK_COUNT = 12;
const deskCount = db.prepare("SELECT COUNT(*) AS c FROM desks").get().c;
if (deskCount === 0) {
  const insert = db.prepare("INSERT INTO desks (id, x, y) VALUES (?, ?, ?)");
  for (let i = 0; i < DESK_COUNT; i++) {
    insert.run(`desk-${i + 1}`, (i % 4) * 4 - 6, Math.floor(i / 4) * 4 - 4);
  }
  console.log(`Seeded ${DESK_COUNT} desks`);
}

const getStmt = db.prepare("SELECT * FROM players WHERE desk_id = ?");
const insertStmt = db.prepare(
  "INSERT INTO players (desk_id, name, character, x, y) VALUES (?, ?, ?, ?, ?)"
);
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
        `SELECT d.id, d.x, d.y, p.name AS occupant
         FROM desks d LEFT JOIN players p ON p.desk_id = d.id`
      )
      .all(),
};
