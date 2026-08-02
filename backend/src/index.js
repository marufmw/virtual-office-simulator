const http = require("node:http");
const { WebSocketServer } = require("ws");
const db = require("./db");
const { createHuddleStore } = require("./huddles");
const { createBoardStore } = require("./boards");
const { serveStatic } = require("./static");
const {
  validateNewDesk,
  validateMove,
  validateReseat,
  validateRoom,
  sameRoom,
} = require("./layout");

const PORT = process.env.PORT || 3001;
const SAVE_INTERVAL_MS = 10_000;
const HUDDLE_INTERVAL_MS = 200; // how often proximity groups are recomputed
const BOARD_SAVE_INTERVAL_MS = 3000; // and how often a changed whiteboard is written down
const BOARD_ID = "office"; // the one board there is, so far
const SPAWN_OFFSET_Y = -1.6; // players appear just in front of their desk
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 40;

// HTTP server: the desk list and floor-plan editing. Everything that
// happens once you're in the room is WebSocket.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
};

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8192) req.destroy(); // nothing legitimate is this big
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

// A failed request must never take the office down with it
/**
 * Stores a room the layout rules asked for and tells everyone the walls
 * moved. A no-op when the desk already fitted, which is the common case.
 */
async function applyRoom(room) {
  if (sameRoom(room, await db.getRoom())) return room;
  await db.saveRoom(room);
  broadcast({ type: "room_resized", room });
  return room;
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(`${req.method} ${req.url} failed:`, error);
    if (!res.headersSent) send(res, 500, { error: "The office hit a snag" });
  });
});

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // The whole floor plan: the room's walls plus every desk in it
  if (path === "/api/office" && req.method === "GET") {
    send(res, 200, { room: await db.getRoom(), desks: await db.loadDesksWithStatus() });
    return;
  }

  if (path === "/api/desks" && req.method === "GET") {
    send(res, 200, await db.loadDesksWithStatus());
    return;
  }

  if (path === "/api/desks" && req.method === "POST") {
    const body = (await readJson(req)) ?? {};
    const check = validateNewDesk(body, await db.loadDesks(), await db.getRoom());
    if (!check.ok) return send(res, 400, { error: check.error });

    const room = await applyRoom(check.value.room);
    const desk = await db.addDesk(check.value.id, check.value.x, check.value.y);
    broadcast({ type: "desk_added", desk });
    return send(res, 201, { ...desk, room });
  }

  // Resizing the walls by hand, which — unlike dragging a desk — may
  // also shrink the office
  if (path === "/api/room" && req.method === "PATCH") {
    const body = (await readJson(req)) ?? {};
    const check = validateRoom(body, await db.loadDesks());
    if (!check.ok) return send(res, 400, { error: check.error });

    const room = await applyRoom(check.value);
    return send(res, 200, { room });
  }

  const deskMatch = path.match(/^\/api\/desks\/([^/]+)$/);
  if (deskMatch && req.method === "PATCH") {
    const id = decodeURIComponent(deskMatch[1]);
    const body = (await readJson(req)) ?? {};
    const check = validateMove({ id, x: body.x, y: body.y }, await db.loadDesks(), await db.getRoom());
    if (!check.ok) return send(res, 400, { error: check.error });

    const { x, y } = check.value;
    const room = await applyRoom(check.value.room);
    await db.moveDesk(id, x, y);
    // The occupant rides along, so a connected one has to be told where
    // they now stand
    const seated = onlinePlayerAtDesk(id);
    if (seated) {
      seated.player.x = x;
      seated.player.y = y + SPAWN_OFFSET_Y;
      worldMoved = true;
      broadcast({ type: "move", id: seated.id, x: seated.player.x, y: seated.player.y });
    }
    broadcast({ type: "desk_moved", id, x, y });
    return send(res, 200, { id, x, y, room });
  }

  if (deskMatch && req.method === "DELETE") {
    const id = decodeURIComponent(deskMatch[1]);
    if (!(await db.getDesk(id))) return send(res, 404, { error: "That desk is gone" });
    if (await db.getPlayer(id)) return send(res, 409, { error: "Move whoever sits there first" });

    await db.removeDesk(id);
    broadcast({ type: "desk_removed", id });
    return send(res, 200, { id });
  }

  // Renaming or clearing whoever sits at a desk, from the layout editor.
  // Reseating them is /api/reseat; this is about the person, not the seat.
  const occupantMatch = path.match(/^\/api\/desks\/([^/]+)\/occupant$/);
  if (occupantMatch && (req.method === "PATCH" || req.method === "DELETE")) {
    const deskId = decodeURIComponent(occupantMatch[1]);
    const seated = await db.getPlayer(deskId);
    if (!seated) return send(res, 404, { error: "Nobody sits there" });

    const session = onlinePlayerAtDesk(deskId);

    if (req.method === "DELETE") {
      // Someone still connected would be left as a character nobody is,
      // so the seat is only cleared once they've gone — the same rule
      // that stops a desk being deleted out from under its occupant
      if (session) return send(res, 409, { error: "They're here right now — ask them to leave" });
      await db.clearSeat(deskId);
      broadcast({ type: "desk_vacated", id: deskId });
      return send(res, 200, { id: deskId });
    }

    const body = (await readJson(req)) ?? {};
    const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (!name) return send(res, 400, { error: "A name can't be empty" });

    await db.updateProfile(deskId, { deskId, name, character: seated.character });
    // Whoever is playing them right now should see it too
    if (session) {
      session.player.name = name;
      broadcast({ type: "update", player: publicPlayer(session.id, session.player) });
    }
    broadcast({ type: "occupant_renamed", id: deskId, name });
    return send(res, 200, { id: deskId, name });
  }

  if (path === "/api/reseat" && req.method === "POST") {
    const body = (await readJson(req)) ?? {};
    // Occupancy is read once up front so the validator stays synchronous
    const seating = await db.loadDesksWithStatus();
    const occupied = new Set(seating.filter((d) => d.occupant).map((d) => d.id));
    const check = validateReseat(body, seating, (deskId) => occupied.has(deskId));
    if (!check.ok) return send(res, 400, { error: check.error });

    const { fromDeskId, toDeskId, swap } = check.value;
    // Sessions have to be looked up before the desk ids move underneath them
    const mover = onlinePlayerAtDesk(fromDeskId);
    const displaced = swap ? onlinePlayerAtDesk(toDeskId) : null;

    const applyTo = (session, record) => {
      if (!session || !record) return;
      session.player.deskId = record.desk_id;
      session.player.x = record.x;
      session.player.y = record.y;
      worldMoved = true;
      broadcast({ type: "update", player: publicPlayer(session.id, session.player) });
    };

    if (swap) {
      const seats = await db.swapSeats(fromDeskId, toDeskId);
      if (!seats) return send(res, 409, { error: "Those seats just changed" });
      applyTo(mover, seats[toDeskId]);
      applyTo(displaced, seats[fromDeskId]);
    } else {
      applyTo(mover, await db.reseatPlayer(fromDeskId, toDeskId));
    }

    return send(res, 200, { fromDeskId, toDeskId, swapped: swap });
  }

  if (path === "/api/layout/reset" && req.method === "POST") {
    await db.resetLayout();
    // Everyone's seat just changed underneath them; simplest honest thing
    // is to have the clients reload into the fresh office
    broadcast({ type: "layout_reset" });
    return send(res, 200, { room: await db.getRoom(), desks: await db.loadDesksWithStatus() });
  }

  // Something for a host's health check to knock on
  if (path === "/healthz") return send(res, 200, { ok: true, online: players.size });

  // Anything that isn't the API is the app itself, when it's been built
  // alongside us
  if (!path.startsWith("/api/") && serveStatic(req, res, path)) return;

  send(res, 404, { error: "Not found" });
}

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

/**
 * The nearest spot to (x, y) where somebody can actually stand: not on
 * another person, not inside a desk, not in a wall. Searched outward in
 * rings so the person is nudged as little as possible.
 */
async function freeSpotNear(x, y, exceptId) {
  const desks = await db.loadDesks();
  const room = await db.getRoom();
  const inset = 1.5; // half a desk plus the player's own half-width

  const blocked = (px, py) =>
    px < room.minX + inset ||
    px > room.maxX - inset ||
    py < room.minY + inset ||
    py > room.maxY - inset ||
    collides(px, py, exceptId) ||
    desks.some((d) => Math.abs(d.x - px) < inset && Math.abs(d.y - py) < inset);

  for (let ring = 1; ring <= 15; ring++) {
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const px = x + Math.cos(angle) * ring * 1.2;
      const py = y + Math.sin(angle) * ring * 1.2;
      if (!blocked(px, py)) return { x: px, y: py };
    }
  }
  return null;
}

/**
 * Moves anyone standing where `id` has forced their way to. Someone
 * parked on your desk gets stepped aside rather than blocking you out of
 * your own seat forever.
 */
async function displaceOthers(id, x, y) {
  for (const [pid, other] of players) {
    if (pid === id) continue;
    if (Math.abs(other.x - x) >= PLAYER_SIZE || Math.abs(other.y - y) >= PLAYER_SIZE) continue;

    const spot = await freeSpotNear(other.x, other.y, pid);
    if (!spot) continue;

    other.x = spot.x;
    other.y = spot.y;
    await db.savePosition(other.deskId, spot.x, spot.y);
    worldMoved = true;
    // The person being moved needs the authoritative form, or their own
    // client will walk straight back from where it thinks it is
    if (other.ws.readyState === 1) {
      other.ws.send(JSON.stringify({ type: "position", x: spot.x, y: spot.y }));
    }
    broadcast({ type: "move", id: pid, x: spot.x, y: spot.y }, pid);
    console.log(`${other.name} was stepped aside by ${players.get(id)?.name}`);
  }
}

function broadcast(data, exceptId = null) {
  const message = JSON.stringify(data);
  for (const [id, player] of players) {
    if (id !== exceptId && player.ws.readyState === 1) {
      player.ws.send(message);
    }
  }
}

// The connected session sitting at a desk, if that person happens to be
// online right now — desks can also be edited while their owner is away
function onlinePlayerAtDesk(deskId) {
  for (const [pid, p] of players) {
    if (p.deskId === deskId) return { id: pid, player: p };
  }
  return null;
}

// --- One client per character ---------------------------------------------
//
// A character is driven from one place at a time. A second client asking for
// a seat that's in use doesn't join: it waits here, everyone attached to
// that character is told, and whichever of them claims it takes over.

const contenders = new Map(); // deskId -> Map(sessionId -> { ws, demote })

function addContender(deskId, sessionId, entry) {
  if (!contenders.has(deskId)) contenders.set(deskId, new Map());
  contenders.get(deskId).set(sessionId, entry);
}

function dropContender(deskId, sessionId) {
  const waiting = contenders.get(deskId);
  if (!waiting) return;
  waiting.delete(sessionId);
  if (waiting.size === 0) contenders.delete(deskId);
}

const sendTo = (ws, payload) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
};

/**
 * Tells everyone attached to a character where they stand: the one client
 * driving it that others are asking, and the ones waiting who currently
 * holds it. Sent whenever that set changes.
 */
function announceSeat(deskId) {
  const holder = onlinePlayerAtDesk(deskId);
  const waiting = contenders.get(deskId)?.size ?? 0;

  if (holder) {
    sendTo(holder.player.ws, { type: "seat", deskId, active: true, waiting });
  }
  for (const entry of contenders.get(deskId)?.values() ?? []) {
    sendTo(entry.ws, {
      type: "seat",
      deskId,
      active: false,
      holder: holder ? holder.player.name : null,
      waiting,
    });
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

// Periodically persist the world state. A failed write is worth a line in
// the log but must not take the office down.
setInterval(async () => {
  try {
    for (const p of players.values()) {
      await db.savePosition(p.deskId, p.x, p.y);
    }
  } catch (error) {
    console.error("Could not save positions:", error);
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

// --- The whiteboard ------------------------------------------------------

const board = createBoardStore();

// Who else is standing at the board, as the client needs to name them
const boardMembers = () =>
  [...board.members].map((pid) => ({ id: pid, name: players.get(pid)?.name ?? "Someone" }));

// Tells everyone at the board that its membership changed, so a name can
// appear or disappear from the "drawing here" list without a redraw
function announceBoard() {
  const members = boardMembers();
  for (const pid of board.members) {
    const member = players.get(pid);
    if (member?.ws.readyState === 1) {
      member.ws.send(JSON.stringify({ type: "board", near: true, members }));
    }
  }
}

// Recompute on a timer rather than per move: positions arrive at ~20 Hz per
// player and only the resulting membership matters.
setInterval(async () => {
  if (!worldMoved) return;
  worldMoved = false;

  const positions = [...players].map(([pid, p]) => [pid, { x: p.x, y: p.y }]);
  for (const { playerId, huddle } of huddles.sync(positions)) {
    const member = players.get(playerId);
    if (member?.ws.readyState === 1) member.ws.send(JSON.stringify(huddlePayload(huddle)));
  }

  // Walking up to the board hands you the scene as it stands; walking off
  // just tells you that you've left it
  const room = await db.getRoom();
  const changes = board.sync(positions, room);
  for (const { playerId, near } of changes) {
    const member = players.get(playerId);
    if (member?.ws.readyState !== 1) continue;
    member.ws.send(
      JSON.stringify(
        near
          ? { type: "board", near: true, members: boardMembers(), elements: board.snapshot() }
          : { type: "board", near: false, members: [] }
      )
    );
  }
  // Anyone already there needs the new list too
  if (changes.length > 0) announceBoard();
}, HUDDLE_INTERVAL_MS);

// The drawing outlives the people drawing it, so it goes to the database —
// on a timer, because a scene changes on every stroke.
setInterval(async () => {
  if (!board.dirty) return;
  try {
    await db.saveBoard(BOARD_ID, board.snapshot(), Date.now());
    board.markSaved();
  } catch (error) {
    console.error("Could not save the whiteboard:", error);
  }
}, BOARD_SAVE_INTERVAL_MS);

wss.on("connection", (ws) => {
  const id = nextId++;
  let player = null;
  let joining = false;
  let waitingFor = null; // the desk this connection is queued for, if any

  /**
   * Hands the character over to another client. This connection keeps its
   * socket and joins the queue for the same seat, so it can take it back.
   */
  function demote() {
    if (!player) return;
    const deskId = player.deskId;
    db.savePosition(deskId, player.x, player.y).catch((error) =>
      console.error(`Could not save ${player.name}'s position on handover:`, error)
    );
    players.delete(id);
    board.remove(id);
    player = null;
    worldMoved = true;
    broadcast({ type: "leave", id });

    waitingFor = deskId;
    addContender(deskId, id, { ws, demote });
    console.log(`Seat ${deskId} handed over (${players.size} online)`);
  }

  /**
   * Walks in as whoever sits at `deskId`. The seat must already be free of
   * a live session — the callers see to that.
   */
  async function enterOffice(deskId) {
    const record = await db.getPlayer(deskId);
    if (!record) {
      sendTo(ws, { type: "error", reason: "invalid_desk" });
      return;
    }

    // Read the floor plan before joining the room. A socket in `players`
    // receives broadcasts, and while this waits on the database somebody
    // else may well move — init has to be the first thing this client
    // sees, or it is told about a move it has no world to apply it to.
    // Two independent reads, fetched together to cost one round trip.
    const [room, desks] = await Promise.all([db.getRoom(), db.loadDesks()]);

    player = {
      ws,
      demote,
      deskId: record.desk_id,
      name: record.name,
      x: record.x,
      y: record.y,
      color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
      character: record.character,
    };
    players.set(id, player);
    console.log(`Player ${player.name} (${player.deskId}) joined (${players.size} online)`);

    sendTo(ws, {
      type: "init",
      id,
      room,
      desks,
      players: [...players].map(([pid, p]) => publicPlayer(pid, p)),
    });
    broadcast({ type: "join", player: publicPlayer(id, player) }, id);
    worldMoved = true;
  }

  /**
   * Takes the character over: whoever is driving it is set aside, and this
   * connection walks in as them.
   */
  async function claimSeat() {
    if (!waitingFor || joining) return;
    joining = true;
    const deskId = waitingFor;

    const holder = onlinePlayerAtDesk(deskId);
    if (holder) holder.player.demote();

    dropContender(deskId, id);
    waitingFor = null;
    await enterOffice(deskId);
    joining = false;
    announceSeat(deskId);
  }

  // The store is over the network now, so handling a message is async. A
  // rejection here would otherwise be unhandled and take the process down.
  ws.on("message", (data) => {
    handleMessage(data).catch((error) => console.error("Dropped a message:", error));
  });

  async function handleMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (!player) {
      // Before joining, the only other thing a connection can say is that
      // it wants the seat it was told is busy
      if (msg.type === "claim_seat") return claimSeat();

      // First message must be the join handshake
      if (msg.type !== "hello" || typeof msg.deskId !== "string" || !msg.deskId) return;
      // The handshake now waits on the database, so a second hello arriving
      // in the meantime must not start a second join
      if (joining) return;
      joining = true;

      const desk = await db.getDesk(msg.deskId);
      if (!desk) {
        // desk IDs come from the seeded set only
        joining = false;
        ws.send(JSON.stringify({ type: "error", reason: "invalid_desk" }));
        return;
      }

      // An unclaimed desk gets its player record now, so that whichever
      // client ends up driving the character finds someone to be
      if (!(await db.getPlayer(msg.deskId))) {
        if (typeof msg.name !== "string" || !msg.name) {
          joining = false;
          return; // new desks need a name
        }
        const character = CHARACTERS.includes(msg.character)
          ? msg.character
          : CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        // New players start beside their designated desk
        await db.createPlayer(msg.deskId, msg.name, character, desk.x, desk.y + SPAWN_OFFSET_Y);
      }

      // Only one client drives a character, and the newest one always wins:
      // opening the office on your phone shouldn't leave you staring at a
      // locked door because a tab is still open on your laptop. Whoever had
      // it is set aside, told where it went, and can take it straight back.
      const holder = onlinePlayerAtDesk(msg.deskId);
      if (holder) holder.player.demote();

      await enterOffice(msg.deskId);
      joining = false;
      announceSeat(msg.deskId);
      return;
    }

    if (msg.type === "update_profile") {
      const oldDeskId = player.deskId;
      // Only seeded, unclaimed desks can be taken
      const requested = typeof msg.deskId === "string" && msg.deskId ? msg.deskId : oldDeskId;
      const takeable =
        requested === oldDeskId ||
        ((await db.getDesk(requested)) && !(await db.getPlayer(requested)));
      const deskId = takeable ? requested : oldDeskId;

      player.name = typeof msg.name === "string" && msg.name ? msg.name : player.name;
      player.character = CHARACTERS.includes(msg.character) ? msg.character : player.character;
      player.deskId = deskId;

      await db.updateProfile(oldDeskId, { deskId, name: player.name, character: player.character });
      broadcast({ type: "update", player: publicPlayer(id, player) });
      return;
    }

    // One-on-one text message to another connected player
    if (msg.type === "dm") {
      const target = players.get(msg.to);
      const body = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
      if (!target || !body || msg.to === id) return;

      const createdAt = Date.now();
      await db.saveMessage(player.deskId, target.deskId, body, createdAt);

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

    // A stroke on the whiteboard. Only what actually won the merge goes
    // back out, so a client echoing a stale element doesn't start a loop.
    if (msg.type === "board_update") {
      if (!board.members.has(id) || !Array.isArray(msg.elements)) return;
      const accepted = board.merge(msg.elements);
      if (accepted.length === 0) return;

      const envelope = JSON.stringify({ type: "board_update", elements: accepted });
      for (const pid of board.members) {
        if (pid === id) continue; // their own edit is already on their screen
        const member = players.get(pid);
        if (member?.ws.readyState === 1) member.ws.send(envelope);
      }
      return;
    }

    // Where someone's pen is. Not stored and not merged — a cursor is only
    // interesting while it's moving.
    if (msg.type === "board_pointer") {
      if (!board.members.has(id)) return;
      const envelope = JSON.stringify({
        type: "board_pointer",
        id,
        name: player.name,
        pointer: msg.pointer,
        button: msg.button,
        selectedElementIds: msg.selectedElementIds,
      });
      for (const pid of board.members) {
        if (pid === id) continue;
        const member = players.get(pid);
        if (member?.ws.readyState === 1) member.ws.send(envelope);
      }
      return;
    }

    // Chat history with another player, requested when a chat opens
    if (msg.type === "dm_history") {
      const target = players.get(msg.with);
      if (!target) return;
      const messages = await db.loadConversation(player.deskId, target.deskId);
      ws.send(JSON.stringify({ type: "dm_history", with: msg.with, messages }));
      return;
    }

    if (msg.type === "move" && typeof msg.x === "number" && typeof msg.y === "number") {
      // Someone who has been stuck long enough walks through obstacles, so
      // a desk dropped on top of them can't strand them forever
      if (!msg.phasing && collides(msg.x, msg.y, id)) {
        // Reject: send the authoritative position back so the client snaps to it
        ws.send(JSON.stringify({ type: "position", x: player.x, y: player.y }));
        return;
      }
      player.x = msg.x;
      player.y = msg.y;
      worldMoved = true;
      // The move itself goes out first — stepping people aside reads the
      // floor plan, and nobody's walk should wait on that
      broadcast({ type: "move", id, x: player.x, y: player.y }, id);
      // Forcing through means anyone in the way gets stepped aside
      if (msg.phasing) await displaceOthers(id, player.x, player.y);
    }
  }

  ws.on("close", () => {
    // A connection that was only queued for a seat gives up its place, and
    // the rest are told the queue got shorter
    if (waitingFor) {
      const deskId = waitingFor;
      waitingFor = null;
      dropContender(deskId, id);
      announceSeat(deskId);
      return;
    }

    if (!player) return;
    const deskId = player.deskId;
    players.delete(id);
    board.remove(id);
    worldMoved = true;
    db.savePosition(deskId, player.x, player.y).catch((error) =>
      console.error(`Could not save ${player.name}'s last position:`, error)
    );
    broadcast({ type: "leave", id });
    console.log(`Player ${player.name} (${deskId}) left (${players.size} online)`);
    // The character is free now; anyone waiting on it can walk in
    announceSeat(deskId);
  });
});

// The tables have to exist before the first person knocks, so nothing is
// served until the database is ready
db.init()
  .then(async () => {
    const savedPlayers = await db.loadPlayers();
    console.log(`Loaded ${savedPlayers.length} player(s) from the database`);
    board.load(await db.loadBoard(BOARD_ID));
    console.log(`Whiteboard restored with ${board.snapshot().length} element(s)`);
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (WebSocket on the same port)`);
    });
  })
  .catch((error) => {
    console.error("Could not reach the database:", error);
    process.exit(1);
  });
