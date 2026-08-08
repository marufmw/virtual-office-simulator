import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";

import { normaliseEmail } from "../auth/auth.service";
import { Desk } from "../database/entities/desk.entity";
import { User } from "../database/entities/user.entity";
import { DeskPosition } from "./layout";
import { SPAWN_OFFSET_Y } from "./office.constants";

/** A desk as the floor plan is drawn from it */
export interface DeskCard {
  id: string;
  code: string;
  x: number;
  y: number;
  /** The email sat here by the admin, or null for an empty desk */
  email: string | null;
  /** Their name, once they have signed in at least once */
  occupant: string | null;
  character: string | null;
}

@Injectable()
export class DesksService {
  constructor(
    @InjectRepository(Desk) private readonly desks: Repository<Desk>,
    @InjectRepository(User) private readonly users: Repository<User>
  ) {}

  list(officeId: string): Promise<Desk[]> {
    return this.desks.find({ where: { officeId }, order: { code: "ASC" } });
  }

  /** The desks as the layout editor and the seat list want them */
  async listWithOccupants(officeId: string): Promise<DeskCard[]> {
    const desks = await this.list(officeId);
    const emails = desks.map((d) => d.assignedEmail).filter((e): e is string => !!e);
    const users = emails.length ? await this.users.findBy({ email: In(emails) }) : [];
    const byEmail = new Map(users.map((u) => [u.email, u]));

    return desks.map((desk) => ({
      id: desk.id,
      code: desk.code,
      x: desk.x,
      y: desk.y,
      email: desk.assignedEmail,
      occupant: desk.assignedEmail ? (byEmail.get(desk.assignedEmail)?.name ?? null) : null,
      character: desk.character,
    }));
  }

  /** The positions the layout rules work on, keyed by the code people see */
  async positions(officeId: string): Promise<DeskPosition[]> {
    return (await this.list(officeId)).map((d) => ({ id: d.code, x: d.x, y: d.y }));
  }

  byId(officeId: string, id: string): Promise<Desk | null> {
    return this.desks.findOneBy({ officeId, id });
  }

  seatOf(officeId: string, email: string): Promise<Desk | null> {
    return this.desks.findOneBy({ officeId, assignedEmail: normaliseEmail(email) });
  }

  add(officeId: string, code: string, x: number, y: number): Promise<Desk> {
    return this.desks.save(this.desks.create({ officeId, code, x, y }));
  }

  /**
   * Moves the furniture. The occupant is carried along and left standing in
   * front of it, wherever they were before.
   */
  async move(desk: Desk, x: number, y: number): Promise<Desk> {
    desk.x = x;
    desk.y = y;
    desk.standX = x;
    desk.standY = y + SPAWN_OFFSET_Y;
    return this.desks.save(desk);
  }

  /** Changes the code written on a desk. Where it stands is unaffected. */
  async rename(desk: Desk, code: string): Promise<Desk> {
    desk.code = code;
    return this.desks.save(desk);
  }

  async remove(desk: Desk): Promise<void> {
    await this.desks.delete({ id: desk.id });
  }

  /**
   * Sits somebody at a desk, or empties it. One desk each: taking a seat
   * gives up whichever one that person had before, so the chart can be
   * rearranged without ever passing through an invalid state.
   */
  async assign(desk: Desk, email: string | null): Promise<Desk> {
    if (email) {
      const address = normaliseEmail(email);
      await this.desks.update(
        { officeId: desk.officeId, assignedEmail: address },
        { assignedEmail: null, character: null, standX: null, standY: null }
      );
      desk.assignedEmail = address;
      desk.standX = desk.x;
      desk.standY = desk.y + SPAWN_OFFSET_Y;
    } else {
      desk.assignedEmail = null;
      desk.character = null;
      desk.standX = null;
      desk.standY = null;
    }
    return this.desks.save(desk);
  }

  /** Free desks, for the "sit someone down" list in the editor */
  empty(officeId: string): Promise<Desk[]> {
    return this.desks.findBy({ officeId, assignedEmail: IsNull() });
  }

  async savePosition(deskId: string, x: number, y: number): Promise<void> {
    await this.desks.update({ id: deskId }, { standX: x, standY: y });
  }

  async setCharacter(deskId: string, character: string): Promise<void> {
    await this.desks.update({ id: deskId }, { character });
  }
}
