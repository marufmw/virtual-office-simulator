import type { Server } from "node:http";

import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { WebSocket, WebSocketServer } from "ws";

import { AuthService, SessionUser } from "../auth/auth.service";
import { MessagesService } from "../chat/messages.service";
import { BoardsService } from "../offices/boards.service";
import { DesksService } from "../offices/desks.service";
import { CHARACTERS, SPAWN_OFFSET_Y, randomCharacter } from "../offices/office.constants";
import { OfficesService } from "../offices/offices.service";
import { Huddle } from "./huddle.store";
import { OfficeRoom, Session } from "./office-room";
import {
  BOARD_SAVE_INTERVAL_MS,
  HUDDLE_INTERVAL_MS,
  MAX_MESSAGE_LENGTH,
  PLAYER_COLORS,
  PLAYER_SIZE,
  SAVE_INTERVAL_MS,
} from "./realtime.constants";

/** A session, and the office it is in. What the REST side asks for. */
export interface SeatedSession {
  id: number;
  player: Session;
}

type Payload = Record<string, unknown>;

/**
 * The rooms themselves. Everything that happens once you're inside an
 * office — walking, talking, drawing — arrives here over a WebSocket.
 *
 * A connection says hello with a session token and an office id, and is
 * only let in if the admin has given that email a desk. From then on it
 * belongs to exactly one office: nothing crosses between them.
 *
 * This is deliberately not a Nest `@WebSocketGateway`: those wrap messages
 * in an event/data envelope of their own, and the protocol here is a flat
 * `{ type }` one shared with the browser. The `ws` server is attached to
 * Nest's HTTP server instead, so page, API and rooms share one port.
 */
@Injectable()
export class RealtimeGateway implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeGateway.name);

  private readonly rooms = new Map<string, OfficeRoom>();
  // Clients queued for a seat another of their tabs is currently driving
  private readonly contenders = new Map<string, Map<number, { ws: WebSocket }>>();

  private readonly timers: NodeJS.Timeout[] = [];
  private wss: WebSocketServer | null = null;
  private nextId = 1;

  constructor(
    private readonly auth: AuthService,
    private readonly offices: OfficesService,
    private readonly desks: DesksService,
    private readonly messages: MessagesService,
    private readonly boards: BoardsService
  ) {}

  /** Shares the HTTP server, so a room lives behind the same port. */
  attach(server: Server): void {
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
    let total = 0;
    for (const room of this.rooms.values()) total += room.players.size;
    return total;
  }

  broadcast(officeId: string, data: Payload, exceptId: number | null = null): void {
    const room = this.rooms.get(officeId);
    if (!room) return;
    const message = JSON.stringify(data);
    for (const [id, player] of room.players) {
      if (id !== exceptId) this.sendRaw(player.ws, message);
    }
  }

  /** The live session at a desk, if whoever sits there is online right now */
  onlineAtDesk(officeId: string, deskId: string): SeatedSession | null {
    const room = this.rooms.get(officeId);
    if (!room) return null;
    for (const [id, player] of room.players) {
      if (player.deskId === deskId) return { id, player };
    }
    return null;
  }

  /** Every session belonging to one person in one office */
  sessionsFor(officeId: string, email: string): SeatedSession[] {
    const room = this.rooms.get(officeId);
    if (!room) return [];
    return [...room.players]
      .filter(([, player]) => player.email === email)
      .map(([id, player]) => ({ id, player }));
  }

  /**
   * Puts a connected player where the floor plan now says they stand — a
   * desk was dragged out from under them.
   */
  moveSessionTo(seated: SeatedSession, x: number, y: number): void {
    const room = this.rooms.get(seated.player.officeId);
    seated.player.x = x;
    seated.player.y = y;
    if (room) room.worldMoved = true;
    this.broadcast(seated.player.officeId, { type: "move", id: seated.id, x, y });
  }

  /**
   * Shows somebody the door: the admin took their desk away, or took them
   * off the member list. They are dropped from the room and told why.
   */
  evict(officeId: string, email: string, reason: string): void {
    for (const { id, player } of this.sessionsFor(officeId, email)) {
      this.sendTo(player.ws, { type: "evicted", reason });
      this.removeSession(id, player);
      player.ws.close();
    }
  }

  // --- Timers --------------------------------------------------------------

  private startTimers(): void {
    // Where everyone is standing, written down now and then. A failed write
    // is worth a line in the log but must not take the office down.
    this.timers.push(
      setInterval(async () => {
        try {
          for (const room of this.rooms.values()) {
            for (const player of room.players.values()) {
              await this.desks.savePosition(player.deskId, player.x, player.y);
            }
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
        for (const room of this.rooms.values()) {
          this.syncRoom(room).catch((error) =>
            this.logger.error("Could not sync a room", error as Error)
          );
        }
      }, HUDDLE_INTERVAL_MS)
    );

    // The drawing outlives the people drawing it, so it goes to the
    // database — on a timer, because a scene changes on every stroke.
    this.timers.push(
      setInterval(async () => {
        for (const room of this.rooms.values()) {
          if (!room.board.dirty) continue;
          try {
            await this.boards.save(room.officeId, room.board.snapshot(), Date.now());
            room.board.markSaved();
          } catch (error) {
            this.logger.error("Could not save a whiteboard", error as Error);
          }
        }
      }, BOARD_SAVE_INTERVAL_MS)
    );
  }

  private async syncRoom(room: OfficeRoom): Promise<void> {
    if (!room.worldMoved) return;
    room.worldMoved = false;

    const positions: Array<[number, { x: number; y: number }]> = [...room.players].map(
      ([pid, p]) => [pid, { x: p.x, y: p.y }]
    );

    for (const { playerId, huddle } of room.huddles.sync(positions)) {
      this.sendTo(room.players.get(playerId)?.ws, this.huddlePayload(room, huddle));
    }

    // Walking up to the board hands you the scene as it stands; walking off
    // just tells you that you've left it
    const office = await this.offices.findOrFail(room.officeId).catch(() => null);
    if (!office) return;

    const changes = room.board.sync(positions, this.offices.getRoom(office));
    for (const { playerId, near } of changes) {
      this.sendTo(
        room.players.get(playerId)?.ws,
        near
          ? {
              type: "board",
              near: true,
              members: this.boardMembers(room),
              elements: room.board.snapshot(),
            }
          : { type: "board", near: false, members: [] }
      );
    }
    // Anyone already there needs the new list too
    if (changes.length > 0) this.announceBoard(room);
  }

  // --- Connections ---------------------------------------------------------

  private handleConnection(ws: WebSocket): void {
    const id = this.nextId++;
    let player: Session | null = null;
    let joining = false;
    let waitingFor: string | null = null; // the desk this connection is queued for

    /**
     * Hands the character over to another client of the same person. This
     * connection keeps its socket and queues for the seat, so it can take
     * it back — opening the office on your phone shouldn't lock the tab on
     * your laptop out for good.
     */
    const demote = () => {
      if (!player) return;
      const { deskId, officeId } = player;
      this.removeSession(id, player);
      player = null;

      waitingFor = deskId;
      this.addContender(deskId, id, ws);
      this.announceSeat(officeId, deskId);
    };

    const enterOffice = async (user: SessionUser, officeId: string) => {
      const membership = await this.offices.membershipFor(officeId, user.email);
      if (!membership) {
        this.sendTo(ws, { type: "error", reason: "not_a_member" });
        return;
      }

      const desk = await this.desks.seatOf(officeId, user.email);
      if (!desk) {
        // Seating is the admin's to give; without a desk there is nobody to be
        this.sendTo(ws, { type: "error", reason: "no_seat" });
        return;
      }

      const office = await this.offices.findOrFail(officeId);
      const room = await this.roomFor(officeId);

      // Read the floor plan before joining the room. A socket in `players`
      // receives broadcasts, and while this waits on the database somebody
      // else may well move — init has to be the first thing this client
      // sees, or it is told about a move it has no world to apply it to.
      const desks = await this.desks.listWithOccupants(officeId);
      const character = desk.character ?? randomCharacter();
      if (!desk.character) await this.desks.setCharacter(desk.id, character);

      player = {
        id,
        ws,
        demote,
        officeId,
        email: user.email,
        name: user.name,
        deskId: desk.id,
        deskCode: desk.code,
        x: desk.standX ?? desk.x,
        y: desk.standY ?? desk.y + SPAWN_OFFSET_Y,
        color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
        character,
      };
      room.players.set(id, player);
      this.logger.log(
        `${user.email} entered ${office.name} at ${desk.code} (${room.players.size} in the room)`
      );

      this.sendTo(ws, {
        type: "init",
        id,
        me: {
          email: user.email,
          name: user.name,
          picture: user.picture,
          deskId: desk.id,
          deskCode: desk.code,
          role: membership.role,
        },
        office: { id: office.id, name: office.name },
        room: this.offices.getRoom(office),
        desks,
        players: [...room.players].map(([pid, p]) => this.publicPlayer(pid, p)),
      });
      this.broadcast(officeId, { type: "join", player: this.publicPlayer(id, player) }, id);
      room.worldMoved = true;
    };

    /** Takes the seat back from whichever client of ours is holding it. */
    const claimSeat = async (user: SessionUser, officeId: string) => {
      if (!waitingFor || joining) return;
      joining = true;
      const deskId = waitingFor;

      this.onlineAtDesk(officeId, deskId)?.player.demote();
      this.dropContender(deskId, id);
      waitingFor = null;
      await enterOffice(user, officeId);
      joining = false;
      this.announceSeat(officeId, deskId);
    };

    // Who this connection signed in as, and where it wants to go. Kept so a
    // client can reclaim its seat without saying hello all over again.
    let identity: { user: SessionUser; officeId: string } | null = null;

    const handleMessage = async (data: unknown) => {
      let msg: Payload;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (!player) {
        if (msg.type === "claim_seat" && identity) {
          return claimSeat(identity.user, identity.officeId);
        }

        // The first message must be the handshake: a session token and the
        // office it is for. Nothing is taken on the client's word.
        if (msg.type !== "hello" || joining) return;
        joining = true;

        const user = await this.auth.verify(typeof msg.token === "string" ? msg.token : null);
        const officeId = typeof msg.officeId === "string" ? msg.officeId : "";
        if (!user || !officeId) {
          joining = false;
          this.sendTo(ws, { type: "error", reason: "signed_out" });
          return;
        }

        identity = { user, officeId };

        // One client per person per office, newest wins
        const seat = await this.desks.seatOf(officeId, user.email);
        if (seat) this.onlineAtDesk(officeId, seat.id)?.player.demote();

        await enterOffice(user, officeId);
        joining = false;
        if (player) this.announceSeat(officeId, (player as Session).deskId);
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
        if (identity) this.announceSeat(identity.officeId, deskId);
        return;
      }

      if (!player) return;
      const { officeId, deskId, email } = player;
      this.removeSession(id, player);
      this.logger.log(`${email} left (${this.rooms.get(officeId)?.players.size ?? 0} in the room)`);
      // The character is free now; another of their tabs can walk in
      this.announceSeat(officeId, deskId);
    });
  }

  /** Everything a session can say once it is in a room. */
  private async handlePlayerMessage(player: Session, msg: Payload): Promise<void> {
    const id = player.id;
    const room = this.rooms.get(player.officeId);
    if (!room) return;

    // Their name and their desk are not theirs to choose — the first comes
    // from Google, the second from the admin. Their character is.
    if (msg.type === "set_character") {
      if (!CHARACTERS.includes(msg.character as string)) return;
      player.character = msg.character as string;
      await this.desks.setCharacter(player.deskId, player.character);
      this.broadcast(player.officeId, {
        type: "update",
        player: this.publicPlayer(id, player),
      });
      return;
    }

    // One-on-one text message to another person in the same office
    if (msg.type === "dm") {
      const target = room.players.get(msg.to as number);
      const body = this.trimBody(msg.text);
      if (!target || !body || msg.to === id) return;

      const createdAt = Date.now();
      await this.messages.save(player.officeId, player.email, target.email, body, createdAt);

      // Echo to the sender too, so both sides render the same record
      const envelope = JSON.stringify({
        type: "dm",
        from: id,
        to: msg.to,
        fromEmail: player.email,
        toEmail: target.email,
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
      const huddle = room.huddles.addMessage(id, message);
      if (!huddle) return;

      const envelope = JSON.stringify({ type: "huddle_msg", huddleId: huddle.id, ...message });
      for (const pid of huddle.members) this.sendRaw(room.players.get(pid)?.ws, envelope);
      return;
    }

    // A stroke on the whiteboard. Only what actually won the merge goes
    // back out, so a client echoing a stale element doesn't start a loop.
    if (msg.type === "board_update") {
      if (!room.board.members.has(id) || !Array.isArray(msg.elements)) return;
      const accepted = room.board.merge(msg.elements);
      if (accepted.length === 0) return;

      this.sendToBoard(room, id, JSON.stringify({ type: "board_update", elements: accepted }));
      return;
    }

    // Opening the board asks for the scene as it stands. The greeting sent
    // on walking up is a moment old by the time anyone draws on it, and a
    // client that closed the board and came back has been holding that
    // moment ever since — so the board is re-read rather than remembered.
    if (msg.type === "board_sync") {
      if (!room.board.members.has(id)) return;
      this.sendTo(player.ws, {
        type: "board",
        near: true,
        members: this.boardMembers(room),
        elements: room.board.snapshot(),
      });
      return;
    }

    // Where someone's pen is. Not stored and not merged — a cursor is only
    // interesting while it's moving.
    if (msg.type === "board_pointer") {
      if (!room.board.members.has(id)) return;
      this.sendToBoard(
        room,
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

    // Chat history with somebody, requested when a chat opens
    if (msg.type === "dm_history") {
      const target = room.players.get(msg.with as number);
      if (!target) return;
      const messages = await this.messages.loadConversation(
        player.officeId,
        player.email,
        target.email
      );
      this.sendTo(player.ws, { type: "dm_history", with: msg.with, messages });
      return;
    }

    if (msg.type === "move" && typeof msg.x === "number" && typeof msg.y === "number") {
      // Someone who has been stuck long enough walks through obstacles, so
      // a desk dropped on top of them can't strand them forever
      if (!msg.phasing && this.collides(room, msg.x, msg.y, id)) {
        // Reject: send the authoritative position back so the client snaps to it
        this.sendTo(player.ws, { type: "position", x: player.x, y: player.y });
        return;
      }
      player.x = msg.x;
      player.y = msg.y;
      room.worldMoved = true;
      // The move itself goes out first — stepping people aside reads the
      // floor plan, and nobody's walk should wait on that
      this.broadcast(player.officeId, { type: "move", id, x: player.x, y: player.y }, id);
      // Forcing through means anyone in the way gets stepped aside
      if (msg.phasing) await this.displaceOthers(room, id, player.x, player.y);
    }
  }

  // --- Rooms ---------------------------------------------------------------

  private async roomFor(officeId: string): Promise<OfficeRoom> {
    let room = this.rooms.get(officeId);
    if (!room) {
      room = new OfficeRoom(officeId);
      this.rooms.set(officeId, room);
    }
    // The whiteboard is read once, when the first person walks in
    if (!room.boardLoaded) {
      room.board.load(await this.boards.load(officeId));
      room.boardLoaded = true;
    }
    return room;
  }

  /** Drops a session and tells the room. Used by leaving, handover and eviction. */
  private removeSession(id: number, player: Session): void {
    const room = this.rooms.get(player.officeId);
    // Being shown the door closes the socket, which asks to remove the
    // session a second time; the room is the record of who is still in it
    if (!room?.players.has(id)) return;

    this.desks
      .savePosition(player.deskId, player.x, player.y)
      .catch((error) =>
        this.logger.error(`Could not save ${player.email}'s position`, error as Error)
      );
    room.players.delete(id);
    room.board.remove(id);
    room.worldMoved = true;
    this.broadcast(player.officeId, { type: "leave", id });

    // An empty office costs nothing to keep, but its whiteboard is safely
    // on disk by now and its huddles are over
    if (room.empty && !room.board.dirty) this.rooms.delete(player.officeId);
  }

  // --- One client per person ----------------------------------------------

  private addContender(deskId: string, sessionId: number, ws: WebSocket): void {
    if (!this.contenders.has(deskId)) this.contenders.set(deskId, new Map());
    this.contenders.get(deskId)!.set(sessionId, { ws });
  }

  private dropContender(deskId: string, sessionId: number): void {
    const waiting = this.contenders.get(deskId);
    if (!waiting) return;
    waiting.delete(sessionId);
    if (waiting.size === 0) this.contenders.delete(deskId);
  }

  /**
   * Tells every client attached to a seat where it stands: the one driving
   * it that others are asking, and the ones waiting who holds it.
   */
  private announceSeat(officeId: string, deskId: string): void {
    const holder = this.onlineAtDesk(officeId, deskId);
    const waiting = this.contenders.get(deskId)?.size ?? 0;

    if (holder) {
      this.sendTo(holder.player.ws, { type: "seat", deskId, active: true, waiting });
    }
    for (const entry of this.contenders.get(deskId)?.values() ?? []) {
      this.sendTo(entry.ws, { type: "seat", deskId, active: false, waiting });
    }
  }

  // --- Moving about --------------------------------------------------------

  private collides(room: OfficeRoom, x: number, y: number, exceptId: number | null): boolean {
    for (const [pid, p] of room.players) {
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
    room: OfficeRoom,
    x: number,
    y: number,
    exceptId: number
  ): Promise<{ x: number; y: number } | null> {
    const office = await this.offices.findOrFail(room.officeId);
    const walls = this.offices.getRoom(office);
    const desks = await this.desks.list(room.officeId);
    const inset = 1.5; // half a desk plus the player's own half-width

    const blocked = (px: number, py: number) =>
      px < walls.minX + inset ||
      px > walls.maxX - inset ||
      py < walls.minY + inset ||
      py > walls.maxY - inset ||
      this.collides(room, px, py, exceptId) ||
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
  private async displaceOthers(
    room: OfficeRoom,
    id: number,
    x: number,
    y: number
  ): Promise<void> {
    for (const [pid, other] of room.players) {
      if (pid === id) continue;
      if (Math.abs(other.x - x) >= PLAYER_SIZE || Math.abs(other.y - y) >= PLAYER_SIZE) continue;

      const spot = await this.freeSpotNear(room, other.x, other.y, pid);
      if (!spot) continue;

      other.x = spot.x;
      other.y = spot.y;
      await this.desks.savePosition(other.deskId, spot.x, spot.y);
      room.worldMoved = true;
      // The person being moved needs the authoritative form, or their own
      // client will walk straight back from where it thinks it is
      this.sendTo(other.ws, { type: "position", x: spot.x, y: spot.y });
      this.broadcast(room.officeId, { type: "move", id: pid, x: spot.x, y: spot.y }, pid);
    }
  }

  // --- Talking -------------------------------------------------------------

  /** What a client needs to render a huddle it belongs to */
  private huddlePayload(room: OfficeRoom, huddle: Huddle | null): Payload {
    return {
      type: "huddle",
      huddleId: huddle ? huddle.id : null,
      members: huddle
        ? [...huddle.members].map((pid) => ({
            id: pid,
            name: room.players.get(pid)?.name ?? "Someone",
          }))
        : [],
      messages: huddle ? huddle.messages : [],
    };
  }

  /** Who else is standing at the board, as the client needs to name them */
  private boardMembers(room: OfficeRoom): Array<{ id: number; name: string }> {
    return [...room.board.members].map((pid) => ({
      id: pid,
      name: room.players.get(pid)?.name ?? "Someone",
    }));
  }

  /**
   * Tells everyone at the board that its membership changed, so a name can
   * appear or disappear from the "drawing here" list without a redraw.
   */
  private announceBoard(room: OfficeRoom): void {
    const members = this.boardMembers(room);
    for (const pid of room.board.members) {
      this.sendTo(room.players.get(pid)?.ws, { type: "board", near: true, members });
    }
  }

  /** To everyone at the board but the person whose edit it was */
  private sendToBoard(room: OfficeRoom, exceptId: number, envelope: string): void {
    for (const pid of room.board.members) {
      if (pid === exceptId) continue; // their own edit is already on their screen
      this.sendRaw(room.players.get(pid)?.ws, envelope);
    }
  }

  private trimBody(text: unknown): string {
    return typeof text === "string" ? text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  }

  private publicPlayer(pid: number, p: Session): Payload {
    return {
      id: pid,
      email: p.email,
      deskId: p.deskId,
      deskCode: p.deskCode,
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
