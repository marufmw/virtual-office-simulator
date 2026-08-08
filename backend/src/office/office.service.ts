import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";

import { Desk } from "../database/entities/desk.entity";
import { Player } from "../database/entities/player.entity";
import { RoomRow } from "../database/entities/room.entity";
import { Room } from "./layout";
import { DEFAULT_CHARACTER, DEFAULT_ROOM, SEED, SPAWN_OFFSET_Y } from "./office.constants";

/** A desk plus who, if anyone, is on it. The shape the floor plan is sent in. */
export interface DeskWithStatus {
  id: string;
  x: number;
  y: number;
  occupant: string | null;
  occupant_character: string | null;
}

/**
 * The floor plan: the walls, the desks, and which person sits where.
 *
 * Seating changes span three tables — a person's chat history is keyed on
 * the desk they sit at — so reseating and swapping run in transactions
 * rather than as loose updates.
 */
@Injectable()
export class OfficeService implements OnModuleInit {
  private readonly logger = new Logger(OfficeService.name);

  constructor(
    @InjectRepository(Desk) private readonly desks: Repository<Desk>,
    @InjectRepository(Player) private readonly players: Repository<Player>,
    @InjectRepository(RoomRow) private readonly rooms: Repository<RoomRow>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  /**
   * Lays out the office if this is a fresh database. Once the floor plan
   * has been edited the database is the truth and nothing here overwrites
   * it. Migrations have already run by the time Nest starts the modules.
   */
  async onModuleInit(): Promise<void> {
    if ((await this.desks.count()) === 0) await this.seedOffice();
    if (!(await this.getRoom())) await this.saveRoom(DEFAULT_ROOM);
    this.logger.log(`Office ready with ${await this.desks.count()} desk(s)`);
  }

  // --- The room ---

  async getRoom(): Promise<Room | null> {
    const row = await this.rooms.findOneBy({ id: 1 });
    return row ? { minX: row.minX, maxX: row.maxX, minY: row.minY, maxY: row.maxY } : null;
  }

  async saveRoom(room: Room): Promise<Room> {
    await this.rooms.upsert({ id: 1, ...room }, ["id"]);
    return room;
  }

  // --- Desks ---

  getDesk(id: string): Promise<Desk | null> {
    return this.desks.findOneBy({ id });
  }

  loadDesks(): Promise<Desk[]> {
    return this.desks.find();
  }

  /** Desks with a flag showing whether a player record occupies them */
  loadDesksWithStatus(): Promise<DeskWithStatus[]> {
    return this.desks
      .createQueryBuilder("d")
      .leftJoin(Player, "p", "p.deskId = d.id")
      .select("d.id", "id")
      .addSelect("d.x", "x")
      .addSelect("d.y", "y")
      .addSelect("p.name", "occupant")
      .addSelect("p.character", "occupant_character")
      .getRawMany<DeskWithStatus>();
  }

  async addDesk(id: string, x: number, y: number): Promise<Desk> {
    await this.desks.insert({ id, x, y });
    return { id, x, y };
  }

  /**
   * Moves the furniture. The occupant, if any, is carried along and left
   * standing in front of it.
   */
  async moveDesk(id: string, x: number, y: number): Promise<{ id: string; x: number; y: number }> {
    await this.desks.update({ id }, { x, y });
    await this.players.update({ deskId: id }, { x, y: y + SPAWN_OFFSET_Y });
    return { id, x, y };
  }

  async removeDesk(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.deleteConversationsFor(manager, id);
      await manager.delete(Player, { deskId: id });
      await manager.delete(Desk, { id });
    });
  }

  // --- People ---

  getPlayer(deskId: string): Promise<Player | null> {
    return this.players.findOneBy({ deskId });
  }

  loadPlayers(): Promise<Player[]> {
    return this.players.find();
  }

  async createPlayer(
    deskId: string,
    name: string,
    character: string,
    x: number,
    y: number
  ): Promise<Player> {
    const player = { deskId, name, character, x, y };
    await this.players.insert(player);
    return player;
  }

  savePosition(deskId: string, x: number, y: number): Promise<unknown> {
    return this.players.update({ deskId }, { x, y });
  }

  updateProfile(
    oldDeskId: string,
    { deskId, name, character }: { deskId: string; name: string; character: string }
  ): Promise<unknown> {
    return this.players.update({ deskId: oldDeskId }, { deskId, name, character });
  }

  /**
   * Empties a seat: the desk stays, the person on it doesn't. Their chat
   * history goes with them — it was keyed to a desk they no longer hold,
   * and leaving it would hand it to whoever sits there next.
   */
  async clearSeat(deskId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.deleteConversationsFor(manager, deskId);
      await manager.delete(Player, { deskId });
    });
  }

  /**
   * Sits an existing person at a different desk, keeping their name,
   * character and chat history (which is keyed on the desk they sat at).
   */
  async reseatPlayer(fromDeskId: string, toDeskId: string): Promise<Player | null> {
    const player = await this.getPlayer(fromDeskId);
    const desk = await this.getDesk(toDeskId);
    if (!player || !desk) return null;

    const y = desk.y + SPAWN_OFFSET_Y;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Player, { deskId: fromDeskId }, { deskId: toDeskId, x: desk.x, y });
      await manager.query("UPDATE messages SET from_desk = $1 WHERE from_desk = $2", [
        toDeskId,
        fromDeskId,
      ]);
      await manager.query("UPDATE messages SET to_desk = $1 WHERE to_desk = $2", [
        toDeskId,
        fromDeskId,
      ]);
    });

    return { ...player, deskId: toDeskId, x: desk.x, y };
  }

  /**
   * Trades two people's desks. Both the seat and the chat history follow
   * the person, so a swap is invisible to their conversations.
   *
   * desk_id is the players table's primary key and a foreign key into
   * desks, so the two rows are removed and re-inserted inside one
   * transaction rather than updated through a placeholder seat.
   */
  async swapSeats(deskA: string, deskB: string): Promise<Record<string, Player> | null> {
    const a = await this.getPlayer(deskA);
    const b = await this.getPlayer(deskB);
    const posA = await this.getDesk(deskA);
    const posB = await this.getDesk(deskB);
    if (!a || !b || !posA || !posB) return null;

    const seatedA: Player = { ...b, deskId: deskA, x: posA.x, y: posA.y + SPAWN_OFFSET_Y };
    const seatedB: Player = { ...a, deskId: deskB, x: posB.x, y: posB.y + SPAWN_OFFSET_Y };

    // No real desk id can start with a space — desk codes must begin with a
    // letter or digit — so this is safe to park a conversation on mid-swap
    const SENTINEL = " swap";
    const rekey = async (manager: EntityManager, column: "from_desk" | "to_desk") => {
      const set = (to: string, from: string) =>
        manager.query(`UPDATE messages SET ${column} = $1 WHERE ${column} = $2`, [to, from]);
      await set(SENTINEL, deskA);
      await set(deskA, deskB);
      await set(deskB, SENTINEL);
    };

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Player, [{ deskId: deskA }, { deskId: deskB }]);
      await manager.insert(Player, [seatedA, seatedB]);
      await rekey(manager, "from_desk");
      await rekey(manager, "to_desk");
    });

    return { [deskA]: seatedA, [deskB]: seatedB };
  }

  /** Throws the room away and lays out the seed office again */
  async resetLayout(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query("DELETE FROM messages");
      await manager.query("DELETE FROM players");
      await manager.query("DELETE FROM desks");
    });
    await this.saveRoom(DEFAULT_ROOM);
    await this.seedOffice();
  }

  /**
   * Lays out the seed office. Every desk is put where the seed says; a
   * seeded person is only created if that seat is empty.
   */
  private async seedOffice(): Promise<void> {
    for (const seat of SEED) {
      await this.desks.upsert({ id: seat.deskId, x: seat.x, y: seat.y }, ["id"]);
      if (!seat.name) continue;
      await this.players
        .createQueryBuilder()
        .insert()
        .values({
          deskId: seat.deskId,
          name: seat.name,
          character: seat.character ?? DEFAULT_CHARACTER,
          x: seat.x,
          y: seat.y + SPAWN_OFFSET_Y,
        })
        .orIgnore()
        .execute();
    }
  }

  private deleteConversationsFor(manager: EntityManager, deskId: string): Promise<unknown> {
    return manager.query("DELETE FROM messages WHERE from_desk = $1 OR to_desk = $1", [deskId]);
  }
}
