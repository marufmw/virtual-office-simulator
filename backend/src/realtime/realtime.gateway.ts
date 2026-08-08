import type { Server } from "node:http";

import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { WebSocket, WebSocketServer } from "ws";

import { BoardsService } from "../office/boards.service";
import { MessagesService } from "../office/messages.service";
import { OfficeService } from "../office/office.service";
import { SPAWN_OFFSET_Y } from "../office/office.constants";
import { BoardStore } from "./board.store";
import { HuddleStore, Huddle } from "./huddle.store";
import {
  BOARD_ID,
  BOARD_SAVE_INTERVAL_MS,
  CHARACTERS,
  HUDDLE_INTERVAL_MS,
  MAX_MESSAGE_LENGTH,
  PLAYER_COLORS,
  PLAYER_SIZE,
  SAVE_INTERVAL_MS,
} from "./realtime.constants";

/** Someone in the room right now, and the socket driving them. */
export interface Session {
  id: number;
  ws: WebSocket;
  deskId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  character: string;
  demote: () => void;
}

/** The seat a session sits at, as the controllers ask for it. */
export interface SeatedSession {
  id: number;
  player: Session;
}

type Payload = Record<string, unknown>;

/**
 * The room itself. Everything that happens once you're inside — walking,
 * talking, drawing — arrives here over a WebSocket, in the same flat
 * `{ type }` envelopes the browser has always spoken.
 *
 * This is deliberately not a Nest `@WebSocketGateway`: those wrap messages
 * in an event/data envelope of their own, and the protocol here predates
 * them. The `ws` server is attached to Nest's HTTP server instead, so the
 * page, the API and the room all share one port.
 */
@Injectable()
export class RealtimeGateway implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeGateway.name);

  private readonly players = new Map<number, Session>();
  private readonly huddles = new HuddleStore();
  private readonly board = new BoardStore();

  // Clients queued for a character somebody else is currently driving
  private readonly contenders = new Map<string, Map<number, { ws: WebSocket; demote: () => void }>>();

  private readonly timers: NodeJS.Timeout[] = [];
  private wss: WebSocketServer | null = null;
  private nextId = 1;
  private worldMoved = true; // set whenever someone moves, joins or leaves

  constructor(
    private readonly office: OfficeService,
    private readonly messages: MessagesService,
    private readonly boards: BoardsService
  ) {}

  /** Shares the HTTP server, so the room lives behind the same port. */
  async attach(server: Server): Promise<void> {
    this.board.load(await this.boards.load(BOARD_ID));
    this.logger.log(`Whiteboard restored with ${this.board.snapshot().length} element(s)`);

    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws) => this.handleConnection(ws));
    this.startTimers();
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    this.wss?.close();
  }

  // --- What the REST side needs -------------------------------------------

  get onlineCount(): number {
    return this.players.size;
  }

  /**
   * The connected session sitting at a desk, if that person happens to be
   * online right now — desks can also be edited while their owner is away.
   */
  onlinePlayerAtDesk(deskId: string): SeatedSession | null {
    for (const [id, player] of this.players) {
      if (player.deskId === deskId) return { id, player };
    }
    return null;
  }

  broadcast(data: Payload, exceptId: number | null = null): void {
    const message = JSON.stringify(data);
    for (const [id, player] of this.players) {
      if (id !== exceptId && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(message);
      }
    }
  }

  /**
   * Puts a connected player where the floor plan says they now stand — a
   * desk was dragged out from under them, so their client has to be told.
   */
  moveSessionTo(seated: SeatedSession, x: number, y: number): void {
    seated.player.x = x;
    seated.player.y = y;
    this.worldMoved = true;
    this.broadcast({ type: "move", id: seated.id, x, y });
  }

  /** Their name was changed from the layout editor while they're here. */
  renameSession(seated: SeatedSession, name: string): void {
    seated.player.name = name;
    this.broadcast({ type: "update", player: this.publicPlayer(seated.id, seated.player) });
  }

  /** They were reseated from the layout editor while they're here. */
  seatSession(
    seated: SeatedSession | null,
    record: { deskId: string; x: number; y: number } | null | undefined
  ): void {
    if (!seated || !record) return;
    seated.player.deskId = record.deskId;
    seated.player.x = record.x;
    seated.player.y = record.y;
    this.worldMoved = true;
    this.broadcast({ type: "update", player: this.publicPlayer(seated.id, seated.player) });
  }

  // --- Timers --------------------------------------------------------------

  private startTimers(): void {
    // Periodically persist the world state. A failed write is worth a line
    // in the log but must not take the office down.
    this.timers.push(
      setInterval(async () => {
        try {
          for (const p of this.players.values()) {
            await this.office.savePosition(p.deskId, p.x, p.y);
          }
        } catch (error) {
          this.logger.error("Could not save positions", error as Error);
        }
      }, SAVE_INTERVAL_MS)
    );

    // Recompute on a timer rather than per move: positions arrive at ~20 Hz
    // per player and only the resulting membership matters.
    this.timers.push(
      setInterval(() => {
        this.syncWorld().catch((error) =>
          this.logger.error("Could not sync the room", error as Error)
        );
      }, HUDDLE_INTERVAL_MS)
    );

    // The drawing outlives the people drawing it, so it goes to the
    // database — on a timer, because a scene changes on every stroke.
    this.timers.push(
      setInterval(async () => {
        if (!this.board.dirty) return;
        try {
          await this.boards.save(BOARD_ID, this.board.snapshot(), Date.now());
          this.board.markSaved();
        } catch (error) {
          this.logger.error("Could not save the whiteboard", error as Error);
        }
      }, BOARD_SAVE_INTERVAL_MS)
    );
  }

  private async syncWorld(): Promise<void> {
    if (!this.worldMoved) return;
    this.worldMoved = false;

    const positions: Array<[number, { x: number; y: number }]> = [...this.players].map(
      ([pid, p]) => [pid, { x: p.x, y: p.y }]
    );

    for (const { playerId, huddle } of this.huddles.sync(positions)) {
      this.sendTo(this.players.get(playerId)?.ws, this.huddlePayload(huddle));
    }

    // Walking up to the board hands you the scene as it stands; walking off
    // just tells you that you've left it
    const room = await this.office.getRoom();
    if (!room) return;

    const changes = this.board.sync(positions, room);
    for (const { playerId, near } of changes) {
      this.sendTo(
        this.players.get(playerId)?.ws,
        near
          ? { type: "board", near: true, members: this.boardMembers(), elements: this.board.snapshot() }
          : { type: "board", near: false, members: [] }
      );
    }
    // Anyone already there needs the new list too
    if (changes.length > 0) this.announceBoard();
  }

  // --- Connections ---------------------------------------------------------

  private handleConnection(ws: WebSocket): void {
    const id = this.nextId++;
    let player: Session | null = null;
    let joining = false;
    let waitingFor: string | null = null; // the desk this connection is queued for, if any

    /**
     * Hands the character over to another client. This connection keeps its
     * socket and joins the queue for the same seat, so it can take it back.
     */
    const demote = () => {
      if (!player) return;
      const deskId = player.deskId;
      const { name, x, y } = player;
      this.office
        .savePosition(deskId, x, y)
        .catch((error) =>
          this.logger.error(`Could not save ${name}'s position on handover`, error as Error)
        );
      this.players.delete(id);
      this.board.remove(id);
      player = null;
      this.worldMoved = true;
      this.broadcast({ type: "leave", id });

      waitingFor = deskId;
      this.addContender(deskId, id, { ws, demote });
      this.logger.log(`Seat ${deskId} handed over (${this.players.size} online)`);
    };

    /**
     * Walks in as whoever sits at `deskId`. The seat must already be free of
     * a live session — the callers see to that.
     */
    const enterOffice = async (deskId: string) => {
      const record = await this.office.getPlayer(deskId);
      if (!record) {
        this.sendTo(ws, { type: "error", reason: "invalid_desk" });
        return;
      }

      // Read the floor plan before joining the room. A socket in `players`
      // receives broadcasts, and while this waits on the database somebody
      // else may well move — init has to be the first thing this client
      // sees, or it is told about a move it has no world to apply it to.
      // Two independent reads, fetched together to cost one round trip.
      const [room, desks] = await Promise.all([this.office.getRoom(), this.office.loadDesks()]);

      player = {
        id,
        ws,
        demote,
        deskId: record.deskId,
        name: record.name,
        x: record.x,
        y: record.y,
        color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
        character: record.character,
      };
      this.players.set(id, player);
      this.logger.log(
        `Player ${player.name} (${player.deskId}) joined (${this.players.size} online)`
      );

      this.sendTo(ws, {
        type: "init",
        id,
        room,
        desks,
        players: [...this.players].map(([pid, p]) => this.publicPlayer(pid, p)),
      });
      this.broadcast({ type: "join", player: this.publicPlayer(id, player) }, id);
      this.worldMoved = true;
    };

    /**
     * Takes the character over: whoever is driving it is set aside, and this
     * connection walks in as them.
     */
    const claimSeat = async () => {
      if (!waitingFor || joining) return;
      joining = true;
      const deskId = waitingFor;

      this.onlinePlayerAtDesk(deskId)?.player.demote();

      this.dropContender(deskId, id);
      waitingFor = null;
      await enterOffice(deskId);
      joining = false;
      this.announceSeat(deskId);
    };

    const handleMessage = async (data: unknown) => {
      let msg: Payload;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (!player) {
        // Before joining, the only other thing a connection can say is that
        // it wants the seat it was told is busy
        if (msg.type === "claim_seat") return claimSeat();

        // First message must be the join handshake
        if (msg.type !== "hello" || typeof msg.deskId !== "string" || !msg.deskId) return;
        // The handshake waits on the database, so a second hello arriving in
        // the meantime must not start a second join
        if (joining) return;
        joining = true;

        const desk = await this.office.getDesk(msg.deskId);
        if (!desk) {
          // desk IDs come from the seeded set only
          joining = false;
          this.sendTo(ws, { type: "error", reason: "invalid_desk" });
          return;
        }

        // An unclaimed desk gets its player record now, so that whichever
        // client ends up driving the character finds someone to be
        if (!(await this.office.getPlayer(msg.deskId))) {
          if (typeof msg.name !== "string" || !msg.name) {
            joining = false;
            return; // new desks need a name
          }
          // New players start beside their designated desk
          await this.office.createPlayer(
            msg.deskId,
            msg.name,
            this.pickCharacter(msg.character),
            desk.x,
            desk.y + SPAWN_OFFSET_Y
          );
        }

        // Only one client drives a character, and the newest one always
        // wins: opening the office on your phone shouldn't leave you
        // staring at a locked door because a tab is still open on your
        // laptop. Whoever had it is set aside, told where it went, and can
        // take it straight back.
        this.onlinePlayerAtDesk(msg.deskId)?.player.demote();

        await enterOffice(msg.deskId);
        joining = false;
        this.announceSeat(msg.deskId);
        return;
      }

      await this.handlePlayerMessage(player, msg);
    };

    // Handling a message is async: a rejection here would otherwise be
    // unhandled and take the process down.
    ws.on("message", (data) => {
      handleMessage(data).catch((error) => this.logger.error("Dropped a message", error as Error));
    });

    ws.on("close", () => {
      // A connection that was only queued for a seat gives up its place, and
      // the rest are told the queue got shorter
      if (waitingFor) {
        const deskId = waitingFor;
        waitingFor = null;
        this.dropContender(deskId, id);
        this.announceSeat(deskId);
        return;
      }

      if (!player) return;
      const { deskId, name, x, y } = player;
      this.players.delete(id);
      this.board.remove(id);
      this.worldMoved = true;
      this.office
        .savePosition(deskId, x, y)
        .catch((error) =>
          this.logger.error(`Could not save ${name}'s last position`, error as Error)
        );
      this.broadcast({ type: "leave", id });
      this.logger.log(`Player ${name} (${deskId}) left (${this.players.size} online)`);
      // The character is free now; anyone waiting on it can walk in
      this.announceSeat(deskId);
    });
  }

  /** Everything a session can say once it is in the room. */
  private async handlePlayerMessage(player: Session, msg: Payload): Promise<void> {
    const id = player.id;

    if (msg.type === "update_profile") {
      const oldDeskId = player.deskId;
      // Only seeded, unclaimed desks can be taken
      const requested = typeof msg.deskId === "string" && msg.deskId ? msg.deskId : oldDeskId;
      const takeable =
        requested === oldDeskId ||
        (!!(await this.office.getDesk(requested)) && !(await this.office.getPlayer(requested)));
      const deskId = takeable ? requested : oldDeskId;

      player.name = typeof msg.name === "string" && msg.name ? msg.name : player.name;
      player.character = CHARACTERS.includes(msg.character as string)
        ? (msg.character as string)
        : player.character;
      player.deskId = deskId;

      await this.office.updateProfile(oldDeskId, {
        deskId,
        name: player.name,
        character: player.character,
      });
      this.broadcast({ type: "update", player: this.publicPlayer(id, player) });
      return;
    }

    // One-on-one text message to another connected player
    if (msg.type === "dm") {
      const target = this.players.get(msg.to as number);
      const body = this.trimBody(msg.text);
      if (!target || !body || msg.to === id) return;

      const createdAt = Date.now();
      await this.messages.save(player.deskId, target.deskId, body, createdAt);

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
      this.sendRaw(player.ws, envelope);
      this.sendRaw(target.ws, envelope);
      return;
    }

    // Message to everyone standing in the same huddle
    if (msg.type === "huddle_msg") {
      const body = this.trimBody(msg.text);
      if (!body) return;

      const message = { fromId: id, fromName: player.name, body, createdAt: Date.now() };
      // Null when they wandered off between typing and sending
      const huddle = this.huddles.addMessage(id, message);
      if (!huddle) return;

      const envelope = JSON.stringify({ type: "huddle_msg", huddleId: huddle.id, ...message });
      for (const pid of huddle.members) {
        this.sendRaw(this.players.get(pid)?.ws, envelope);
      }
      return;
    }

    // A stroke on the whiteboard. Only what actually won the merge goes
    // back out, so a client echoing a stale element doesn't start a loop.
    if (msg.type === "board_update") {
      if (!this.board.members.has(id) || !Array.isArray(msg.elements)) return;
      const accepted = this.board.merge(msg.elements);
      if (accepted.length === 0) return;

      this.sendToBoard(id, JSON.stringify({ type: "board_update", elements: accepted }));
      return;
    }

    // Opening the board asks for the scene as it stands. The greeting sent
    // on walking up is a moment old by the time anyone draws on it, and a
    // client that closed the board and came back has been holding that
    // moment ever since — so the board is re-read rather than remembered.
    if (msg.type === "board_sync") {
      if (!this.board.members.has(id)) return;
      this.sendTo(player.ws, {
        type: "board",
        near: true,
        members: this.boardMembers(),
        elements: this.board.snapshot(),
      });
      return;
    }

    // Where someone's pen is. Not stored and not merged — a cursor is only
    // interesting while it's moving.
    if (msg.type === "board_pointer") {
      if (!this.board.members.has(id)) return;
      this.sendToBoard(
        id,
        JSON.stringify({
          type: "board_pointer",
          id,
          name: player.name,
          pointer: msg.pointer,
          button: msg.button,
          selectedElementIds: msg.selectedElementIds,
        })
      );
      return;
    }

    // Chat history with another player, requested when a chat opens
    if (msg.type === "dm_history") {
      const target = this.players.get(msg.with as number);
      if (!target) return;
      const messages = await this.messages.loadConversation(player.deskId, target.deskId);
      this.sendTo(player.ws, { type: "dm_history", with: msg.with, messages });
      return;
    }

    if (msg.type === "move" && typeof msg.x === "number" && typeof msg.y === "number") {
      // Someone who has been stuck long enough walks through obstacles, so
      // a desk dropped on top of them can't strand them forever
      if (!msg.phasing && this.collides(msg.x, msg.y, id)) {
        // Reject: send the authoritative position back so the client snaps to it
        this.sendTo(player.ws, { type: "position", x: player.x, y: player.y });
        return;
      }
      player.x = msg.x;
      player.y = msg.y;
      this.worldMoved = true;
      // The move itself goes out first — stepping people aside reads the
      // floor plan, and nobody's walk should wait on that
      this.broadcast({ type: "move", id, x: player.x, y: player.y }, id);
      // Forcing through means anyone in the way gets stepped aside
      if (msg.phasing) await this.displaceOthers(id, player.x, player.y);
    }
  }

  // --- One client per character --------------------------------------------
  //
  // A character is driven from one place at a time. A second client asking
  // for a seat that's in use doesn't join: it waits here, everyone attached
  // to that character is told, and whichever of them claims it takes over.

  private addContender(
    deskId: string,
    sessionId: number,
    entry: { ws: WebSocket; demote: () => void }
  ): void {
    if (!this.contenders.has(deskId)) this.contenders.set(deskId, new Map());
    this.contenders.get(deskId)!.set(sessionId, entry);
  }

  private dropContender(deskId: string, sessionId: number): void {
    const waiting = this.contenders.get(deskId);
    if (!waiting) return;
    waiting.delete(sessionId);
    if (waiting.size === 0) this.contenders.delete(deskId);
  }

  /**
   * Tells everyone attached to a character where they stand: the one client
   * driving it that others are asking, and the ones waiting who currently
   * holds it. Sent whenever that set changes.
   */
  private announceSeat(deskId: string): void {
    const holder = this.onlinePlayerAtDesk(deskId);
    const waiting = this.contenders.get(deskId)?.size ?? 0;

    if (holder) {
      this.sendTo(holder.player.ws, { type: "seat", deskId, active: true, waiting });
    }
    for (const entry of this.contenders.get(deskId)?.values() ?? []) {
      this.sendTo(entry.ws, {
        type: "seat",
        deskId,
        active: false,
        holder: holder ? holder.player.name : null,
        waiting,
      });
    }
  }

  // --- Moving about --------------------------------------------------------

  private collides(x: number, y: number, exceptId: number | null = null): boolean {
    for (const [pid, p] of this.players) {
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
  private async freeSpotNear(
    x: number,
    y: number,
    exceptId: number
  ): Promise<{ x: number; y: number } | null> {
    const desks = await this.office.loadDesks();
    const room = await this.office.getRoom();
    if (!room) return null;
    const inset = 1.5; // half a desk plus the player's own half-width

    const blocked = (px: number, py: number) =>
      px < room.minX + inset ||
      px > room.maxX - inset ||
      py < room.minY + inset ||
      py > room.maxY - inset ||
      this.collides(px, py, exceptId) ||
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
  private async displaceOthers(id: number, x: number, y: number): Promise<void> {
    for (const [pid, other] of this.players) {
      if (pid === id) continue;
      if (Math.abs(other.x - x) >= PLAYER_SIZE || Math.abs(other.y - y) >= PLAYER_SIZE) continue;

      const spot = await this.freeSpotNear(other.x, other.y, pid);
      if (!spot) continue;

      other.x = spot.x;
      other.y = spot.y;
      await this.office.savePosition(other.deskId, spot.x, spot.y);
      this.worldMoved = true;
      // The person being moved needs the authoritative form, or their own
      // client will walk straight back from where it thinks it is
      this.sendTo(other.ws, { type: "position", x: spot.x, y: spot.y });
      this.broadcast({ type: "move", id: pid, x: spot.x, y: spot.y }, pid);
      this.logger.log(`${other.name} was stepped aside by ${this.players.get(id)?.name}`);
    }
  }

  // --- Talking -------------------------------------------------------------

  /** What a client needs to render a huddle it belongs to */
  private huddlePayload(huddle: Huddle | null): Payload {
    return {
      type: "huddle",
      huddleId: huddle ? huddle.id : null,
      members: huddle
        ? [...huddle.members].map((pid) => ({
            id: pid,
            name: this.players.get(pid)?.name ?? "Someone",
          }))
        : [],
      messages: huddle ? huddle.messages : [],
    };
  }

  /** Who else is standing at the board, as the client needs to name them */
  private boardMembers(): Array<{ id: number; name: string }> {
    return [...this.board.members].map((pid) => ({
      id: pid,
      name: this.players.get(pid)?.name ?? "Someone",
    }));
  }

  /**
   * Tells everyone at the board that its membership changed, so a name can
   * appear or disappear from the "drawing here" list without a redraw.
   */
  private announceBoard(): void {
    const members = this.boardMembers();
    for (const pid of this.board.members) {
      this.sendTo(this.players.get(pid)?.ws, { type: "board", near: true, members });
    }
  }

  /** To everyone at the board but the person whose edit it was */
  private sendToBoard(exceptId: number, envelope: string): void {
    for (const pid of this.board.members) {
      if (pid === exceptId) continue; // their own edit is already on their screen
      this.sendRaw(this.players.get(pid)?.ws, envelope);
    }
  }

  private trimBody(text: unknown): string {
    return typeof text === "string" ? text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  }

  private pickCharacter(requested: unknown): string {
    return CHARACTERS.includes(requested as string)
      ? (requested as string)
      : CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  }

  private publicPlayer(pid: number, p: Session): Payload {
    return {
      id: pid,
      deskId: p.deskId,
      name: p.name,
      x: p.x,
      y: p.y,
      color: p.color,
      character: p.character,
    };
  }

  private sendTo(ws: WebSocket | undefined, payload: Payload): void {
    this.sendRaw(ws, JSON.stringify(payload));
  }

  private sendRaw(ws: WebSocket | undefined, envelope: string): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(envelope);
  }
}
