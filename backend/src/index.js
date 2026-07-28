const http = require("node:http");
const { WebSocketServer } = require("ws");
const db = require("./db");
const { createHuddleStore } = require("./huddles");

const PORT = process.env.PORT || 3001;
const SAVE_INTERVAL_MS = 10_000;
const HUDDLE_INTERVAL_MS = 200; // how often proximity groups are recomputed
const SPAWN_OFFSET_Y = -1.6; // players appear just in front of their desk
const MAX_MESSAGE_LENGTH = 1000;

// HTTP server (only serves the desk list; everything else is WebSocket)
const server = http.createServer((req, res) => {
  if (req.url === "/api/desks") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(db.loadDesksWithStatus()));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

const players = new Map(); // sessionId -> { ws, deskId, name, x, y, character }
let nextId = 1;

const PLAYER_COLORS = ["#4caf50", "#2196f3", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4"];
const CHARACTERS = [
  "character_1",
  "office_blonde_man_red",
  "office_blonde_man_blue",
  "office_man_white_shirt",
  "office_man_dark_red",
  "office_blonde_woman_teal",
  "office_woman_red",
  "office_man_green",
  "office_man_gray",
  "office_woman_pink",
  "office_man_black_suit",
  "office_man_lavender",
  "office_woman_blue",
];
const PLAYER_SIZE = 1; // square side length, used for AABB collision

function collides(x, y, exceptId = null) {
  for (const [pid, p] of players) {
    if (pid !== exceptId && Math.abs(p.x - x) < PLAYER_SIZE && Math.abs(p.y - y) < PLAYER_SIZE) {
      return true;
    }
  }
  return false;
}

function broadcast(data, exceptId = null) {
  const message = JSON.stringify(data);
  for (const [id, player] of players) {
    if (id !== exceptId && player.ws.readyState === 1) {
      player.ws.send(message);
    }
  }
}

const publicPlayer = (pid, p) => ({
  id: pid,
  deskId: p.deskId,
  name: p.name,
  x: p.x,
  y: p.y,
  color: p.color,
  character: p.character,
});

// World state is kept in the players table; log what we loaded at startup
const savedPlayers = db.loadPlayers();
console.log(`Loaded ${savedPlayers.length} player(s) from the database`);

// Periodically persist the world state
setInterval(() => {
  for (const p of players.values()) {
    db.savePosition(p.deskId, p.x, p.y);
  }
}, SAVE_INTERVAL_MS);

// --- Proximity group chat -------------------------------------------------

const huddles = createHuddleStore();
let worldMoved = true; // set whenever someone moves, joins or leaves

// What a client needs to render a huddle it belongs to
const huddlePayload = (huddle) => ({
  type: "huddle",
  huddleId: huddle ? huddle.id : null,
  members: huddle
    ? [...huddle.members].map((pid) => ({ id: pid, name: players.get(pid)?.name ?? "Someone" }))
    : [],
  messages: huddle ? huddle.messages : [],
});

// Recompute on a timer rather than per move: positions arrive at ~20 Hz per
// player and only the resulting membership matters.
setInterval(() => {
  if (!worldMoved) return;
  worldMoved = false;

  const positions = [...players].map(([pid, p]) => [pid, { x: p.x, y: p.y }]);
  for (const { playerId, huddle } of huddles.sync(positions)) {
    const member = players.get(playerId);
    if (member?.ws.readyState === 1) member.ws.send(JSON.stringify(huddlePayload(huddle)));
  }
}, HUDDLE_INTERVAL_MS);

wss.on("connection", (ws) => {
  const id = nextId++;
  let player = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (!player) {
      // First message must be the join handshake
      if (msg.type !== "hello" || typeof msg.deskId !== "string" || !msg.deskId) return;

      const desk = db.getDesk(msg.deskId);
      if (!desk) {
        // desk IDs come from the seeded set only
        ws.send(JSON.stringify({ type: "error", reason: "invalid_desk" }));
        return;
      }

      const existing = db.getPlayer(msg.deskId);
      let record;
      if (existing) {
        record = existing;
      } else {
        if (typeof msg.name !== "string" || !msg.name) return; // new desks need a name
        const character = CHARACTERS.includes(msg.character)
          ? msg.character
          : CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        // New players start beside their designated desk
        record = db.createPlayer(msg.deskId, msg.name, character, desk.x, desk.y + SPAWN_OFFSET_Y);
      }

      player = {
        ws,
        deskId: record.desk_id,
        name: record.name,
        x: record.x,
        y: record.y,
        color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
        character: record.character,
      };
      players.set(id, player);
      console.log(`Player ${player.name} (${player.deskId}) joined (${players.size} online)`);

      ws.send(
        JSON.stringify({
          type: "init",
          id,
          desks: db.loadDesks(),
          players: [...players].map(([pid, p]) => publicPlayer(pid, p)),
        })
      );
      broadcast({ type: "join", player: publicPlayer(id, player) }, id);
      worldMoved = true;
      return;
    }

    if (msg.type === "update_profile") {
      const oldDeskId = player.deskId;
      // Only seeded, unclaimed desks can be taken
      const requested = typeof msg.deskId === "string" && msg.deskId ? msg.deskId : oldDeskId;
      const deskId =
        requested !== oldDeskId && (!db.getDesk(requested) || db.getPlayer(requested))
          ? oldDeskId
          : requested;

      player.name = typeof msg.name === "string" && msg.name ? msg.name : player.name;
      player.character = CHARACTERS.includes(msg.character) ? msg.character : player.character;
      player.deskId = deskId;

      db.updateProfile(oldDeskId, { deskId, name: player.name, character: player.character });
      broadcast({ type: "update", player: publicPlayer(id, player) });
      return;
    }

    // One-on-one text message to another connected player
    if (msg.type === "dm") {
      const target = players.get(msg.to);
      const body = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
      if (!target || !body || msg.to === id) return;

      const createdAt = Date.now();
      db.saveMessage(player.deskId, target.deskId, body, createdAt);

      // Echo to the sender too, so both sides render the same record
      const envelope = JSON.stringify({
        type: "dm",
        from: id,
        to: msg.to,
        fromDesk: player.deskId,
        toDesk: target.deskId,
        body,
        createdAt,
      });
      ws.send(envelope);
      if (target.ws.readyState === 1) target.ws.send(envelope);
      return;
    }

    // Message to everyone standing in the same huddle
    if (msg.type === "huddle_msg") {
      const body = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
      if (!body) return;

      const message = { fromId: id, fromName: player.name, body, createdAt: Date.now() };
      // Null when they wandered off between typing and sending
      const huddle = huddles.addMessage(id, message);
      if (!huddle) return;

      const envelope = JSON.stringify({ type: "huddle_msg", huddleId: huddle.id, ...message });
      for (const pid of huddle.members) {
        const member = players.get(pid);
        if (member?.ws.readyState === 1) member.ws.send(envelope);
      }
      return;
    }

    // Chat history with another player, requested when a chat opens
    if (msg.type === "dm_history") {
      const target = players.get(msg.with);
      if (!target) return;
      ws.send(
        JSON.stringify({
          type: "dm_history",
          with: msg.with,
          messages: db.loadConversation(player.deskId, target.deskId),
        })
      );
      return;
    }

    if (msg.type === "move" && typeof msg.x === "number" && typeof msg.y === "number") {
      if (collides(msg.x, msg.y, id)) {
        // Reject: send the authoritative position back so the client snaps to it
        ws.send(JSON.stringify({ type: "position", x: player.x, y: player.y }));
        return;
      }
      player.x = msg.x;
      player.y = msg.y;
      worldMoved = true;
      broadcast({ type: "move", id, x: player.x, y: player.y }, id);
    }
  });

  ws.on("close", () => {
    if (!player) return;
    players.delete(id);
    worldMoved = true;
    db.savePosition(player.deskId, player.x, player.y);
    broadcast({ type: "leave", id });
    console.log(`Player ${player.name} (${player.deskId}) left (${players.size} online)`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (WebSocket on the same port)`);
});
