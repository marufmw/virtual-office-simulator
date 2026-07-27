const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "office.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    desk_id   TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    character TEXT NOT NULL,
    x         REAL NOT NULL DEFAULT 0,
    y         REAL NOT NULL DEFAULT 0
  )
`);

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
};
