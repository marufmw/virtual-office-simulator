const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;

const wss = new WebSocketServer({ port: PORT });

const players = new Map(); // id -> { ws, x, y, color }
let nextId = 1;

const PLAYER_COLORS = ["#4caf50", "#2196f3", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4"];
const CHARACTERS = ["character_1", "character_2"];
const PLAYER_SIZE = 1; // square side length, used for AABB collision

function collides(x, y, exceptId = null) {
  for (const [pid, p] of players) {
    if (pid !== exceptId && Math.abs(p.x - x) < PLAYER_SIZE && Math.abs(p.y - y) < PLAYER_SIZE) {
      return true;
    }
  }
  return false;
}

function findSpawn() {
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * 10 - 5);
    const y = Math.floor(Math.random() * 10 - 5);
    if (!collides(x, y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

function broadcast(data, exceptId = null) {
  const message = JSON.stringify(data);
  for (const [id, player] of players) {
    if (id !== exceptId && player.ws.readyState === 1) {
      player.ws.send(message);
    }
  }
}

wss.on("connection", (ws) => {
  const id = nextId++;
  const player = {
    ws,
    ...findSpawn(),
    color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
    character: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)],
  };
  players.set(id, player);
  console.log(`Player ${id} connected (${players.size} online)`);

  const publicPlayer = (pid, p) => ({ id: pid, x: p.x, y: p.y, color: p.color, character: p.character });

  // Send the new client its id and the current state of all players
  ws.send(
    JSON.stringify({
      type: "init",
      id,
      players: [...players].map(([pid, p]) => publicPlayer(pid, p)),
    })
  );

  // Tell everyone else about the new player
  broadcast({ type: "join", player: publicPlayer(id, player) }, id);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
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
      broadcast({ type: "move", id, x: player.x, y: player.y }, id);
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
    console.log(`Player ${id} disconnected (${players.size} online)`);
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
