import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";

import { normaliseEmail } from "../auth/auth.service";
import { Desk } from "../database/entities/desk.entity";
import { MemberRole, Membership } from "../database/entities/membership.entity";
import { Message } from "../database/entities/message.entity";
import { Office } from "../database/entities/office.entity";
import { User } from "../database/entities/user.entity";
import { Room, growRoom } from "./layout";
import {
  DEFAULT_ROOM,
  FIRST_DESK_CODE,
  MAX_OFFICE_NAME_LENGTH,
  SPAWN_OFFSET_Y,
} from "./office.constants";

/** An office as it appears in the picker */
export interface OfficeCard {
  id: string;
  name: string;
  role: MemberRole;
  members: number;
  desks: number;
  seat: { id: string; code: string } | null;
}

/** A member, with whatever we know about them and where they sit */
export interface MemberCard {
  email: string;
  role: MemberRole;
  name: string | null;
  picture: string | null;
  signedUp: boolean;
  seat: { id: string; code: string } | null;
}

@Injectable()
export class OfficesService {
  constructor(
    @InjectRepository(Office) private readonly offices: Repository<Office>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(Desk) private readonly desks: Repository<Desk>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  // --- Membership ----------------------------------------------------------

  membershipFor(officeId: string, email: string): Promise<Membership | null> {
    return this.memberships.findOneBy({ officeId, email: normaliseEmail(email) });
  }

  /** Every office this person has been let into, newest first */
  async listFor(email: string): Promise<OfficeCard[]> {
    const address = normaliseEmail(email);
    const mine = await this.memberships.findBy({ email: address });
    if (mine.length === 0) return [];

    const ids = mine.map((m) => m.officeId);
    const [offices, desks, counts] = await Promise.all([
      this.offices.findBy({ id: In(ids) }),
      this.desks.findBy({ officeId: In(ids) }),
      this.memberships.findBy({ officeId: In(ids) }),
    ]);

    const byId = new Map(offices.map((o) => [o.id, o]));
    return mine
      .filter((m) => byId.has(m.officeId))
      .map((m) => {
        const office = byId.get(m.officeId)!;
        const seat = desks.find((d) => d.officeId === m.officeId && d.assignedEmail === address);
        return {
          id: office.id,
          name: office.name,
          role: m.role,
          members: counts.filter((c) => c.officeId === office.id).length,
          desks: desks.filter((d) => d.officeId === office.id).length,
          seat: seat ? { id: seat.id, code: seat.code } : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Starts an office. Whoever creates it is its admin, and gets the one
   * desk it opens with — seating is assigned here, so an office with no
   * desks would be one nobody could walk into, its own admin included.
   */
  async create(user: { email: string }, name: unknown): Promise<OfficeCard> {
    const title = typeof name === "string" ? name.trim().slice(0, MAX_OFFICE_NAME_LENGTH) : "";
    if (!title) throw new BadRequestException({ error: "Give the office a name" });

    const email = normaliseEmail(user.email);
    const office = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(manager.create(Office, { name: title, ...DEFAULT_ROOM }));
      await manager.save(
        manager.create(Membership, { officeId: created.id, email, role: "admin" as const })
      );
      await manager.save(
        manager.create(Desk, {
          officeId: created.id,
          code: FIRST_DESK_CODE,
          x: 0,
          y: 0,
          assignedEmail: email,
        })
      );
      return created;
    });

    return {
      id: office.id,
      name: office.name,
      role: "admin",
      members: 1,
      desks: 1,
      seat: null, // filled in by the caller's next read; the picker refetches
    };
  }

  async findOrFail(officeId: string): Promise<Office> {
    const office = await this.offices.findOneBy({ id: officeId });
    if (!office) throw new NotFoundException({ error: "That office is gone" });
    return office;
  }

  getRoom(office: Office): Room {
    return { minX: office.minX, maxX: office.maxX, minY: office.minY, maxY: office.maxY };
  }

  async saveRoom(officeId: string, room: Room): Promise<Room> {
    await this.offices.update({ id: officeId }, room);
    return room;
  }

  async rename(officeId: string, name: unknown): Promise<{ id: string; name: string }> {
    const title = typeof name === "string" ? name.trim().slice(0, MAX_OFFICE_NAME_LENGTH) : "";
    if (!title) throw new BadRequestException({ error: "Give the office a name" });
    await this.offices.update({ id: officeId }, { name: title });
    return { id: officeId, name: title };
  }

  /** Takes the whole office down: desks, members, chats and the board. */
  async remove(officeId: string): Promise<void> {
    // Everything else points at the office with ON DELETE CASCADE
    await this.offices.delete({ id: officeId });
  }

  // --- The member list -----------------------------------------------------

  async members(officeId: string): Promise<MemberCard[]> {
    const memberships = await this.memberships.findBy({ officeId });
    const emails = memberships.map((m) => m.email);
    const [users, desks] = await Promise.all([
      emails.length ? this.users.findBy({ email: In(emails) }) : Promise.resolve([]),
      this.desks.findBy({ officeId }),
    ]);
    const byEmail = new Map(users.map((u) => [u.email, u]));

    return memberships
      .map((m) => {
        const user = byEmail.get(m.email);
        const seat = desks.find((d) => d.assignedEmail === m.email);
        return {
          email: m.email,
          role: m.role,
          name: user?.name ?? null,
          picture: user?.picture ?? null,
          signedUp: !!user,
          seat: seat ? { id: seat.id, code: seat.code } : null,
        };
      })
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return (a.name ?? a.email).localeCompare(b.name ?? b.email);
      });
  }

  /**
   * Lets somebody in, and sits them down.
   *
   * Seating is assigned here, so a member without a desk is a member who
   * cannot walk in — which is not what adding somebody means. They take the
   * first free desk, or get a new one laid out for them if the office is
   * full.
   */
  async addMember(
    officeId: string,
    email: unknown,
    role: MemberRole = "member"
  ): Promise<{ member: MemberCard; desk: Desk; room: Room; created: boolean }> {
    const address = normaliseEmail(typeof email === "string" ? email : "");
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(address)) {
      throw new BadRequestException({ error: "That isn't an email address" });
    }
    if (await this.membershipFor(officeId, address)) {
      throw new ConflictException({ error: `${address} is already on the list` });
    }

    await this.memberships.save(this.memberships.create({ officeId, email: address, role }));

    const office = await this.findOrFail(officeId);
    const desks = await this.desks.findBy({ officeId });
    const free = desks.find((d) => !d.assignedEmail);
    const room = free ? this.getRoom(office) : await this.growForNewDesk(office, desks);
    const desk = free ?? (await this.layNewDesk(officeId, desks));

    desk.assignedEmail = address;
    desk.standX = desk.x;
    desk.standY = desk.y + SPAWN_OFFSET_Y;
    await this.desks.save(desk);

    const member = (await this.members(officeId)).find((m) => m.email === address)!;
    return { member, desk, room, created: !free };
  }

  /**
   * Somewhere to put a desk nobody has placed by hand: the first spot on a
   * 4-unit grid, spiralling out from the middle, that no other desk is
   * standing on. Walls move outward to take it in, exactly as they do when
   * a desk is dragged past them.
   */
  private freeSpot(desks: Desk[]): { x: number; y: number } {
    const STEP = 4; // desks are 2 units wide; this leaves a walkway
    for (let ring = 0; ring < 20; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          // Only the edge of each ring is new
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const x = dx * STEP;
          const y = dy * STEP;
          if (!desks.some((d) => Math.abs(d.x - x) < STEP && Math.abs(d.y - y) < STEP)) {
            return { x, y };
          }
        }
      }
    }
    return { x: 0, y: 0 }; // twenty rings is 1600 desks; this can't be reached
  }

  private async growForNewDesk(office: Office, desks: Desk[]): Promise<Room> {
    const spot = this.freeSpot(desks);
    const grown = growRoom(this.getRoom(office), spot.x, spot.y);
    return this.saveRoom(office.id, grown);
  }

  private layNewDesk(officeId: string, desks: Desk[]): Promise<Desk> {
    const spot = this.freeSpot(desks);
    // "Desk 7" for the seventh, unless that name is taken by hand already
    let n = desks.length + 1;
    const taken = new Set(desks.map((d) => d.code.toLowerCase()));
    while (taken.has(`desk ${n}`.toLowerCase())) n++;

    return this.desks.save(
      this.desks.create({ officeId, code: `Desk ${n}`, x: spot.x, y: spot.y })
    );
  }

  /**
   * Takes somebody off the list. Their desk is freed and their chats in
   * this office go with them — the seat is about to belong to someone else.
   */
  async removeMember(officeId: string, email: string): Promise<{ email: string }> {
    const address = normaliseEmail(email);
    const membership = await this.membershipFor(officeId, address);
    if (!membership) throw new NotFoundException({ error: "They're not on the list" });
    if (membership.role === "admin" && (await this.adminCount(officeId)) === 1) {
      throw new ConflictException({ error: "An office needs at least one admin" });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Desk,
        { officeId, assignedEmail: address },
        { assignedEmail: null, character: null, standX: null, standY: null }
      );
      await manager.delete(Message, [
        { officeId, fromEmail: address },
        { officeId, toEmail: address },
      ]);
      await manager.delete(Membership, { id: membership.id });
    });

    return { email: address };
  }

  async setRole(officeId: string, email: string, role: MemberRole): Promise<MemberCard> {
    const address = normaliseEmail(email);
    const membership = await this.membershipFor(officeId, address);
    if (!membership) throw new NotFoundException({ error: "They're not on the list" });
    if (role !== "admin" && membership.role === "admin" && (await this.adminCount(officeId)) === 1) {
      throw new ConflictException({ error: "An office needs at least one admin" });
    }

    await this.memberships.update({ id: membership.id }, { role });
    return (await this.members(officeId)).find((m) => m.email === address)!;
  }

  private adminCount(officeId: string): Promise<number> {
    return this.memberships.countBy({ officeId, role: "admin" });
  }
}
