import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import { normaliseEmail } from "../auth/auth.service";
import { DesksService } from "../offices/desks.service";
import {
  Checked,
  Room,
  sameRoom,
  validateCode,
  validateMove,
  validateNewDesk,
  validateRoom,
} from "../offices/layout";
import { OfficeAdminGuard } from "../offices/office-access.guard";
import { SPAWN_OFFSET_Y } from "../offices/office.constants";
import { OfficesService } from "../offices/offices.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

/**
 * Editing a floor plan: the desks, the walls, and who sits where. The
 * admin's alone — OfficeAdminGuard turns everyone else away.
 *
 * The layout rules live in `layout.ts` and return messages written for the
 * person editing, so they are handed straight back as the 400 body rather
 * than run through a validation pipe.
 */
@Controller("api/offices/:officeId")
@UseGuards(AuthGuard, OfficeAdminGuard)
export class LayoutController {
  constructor(
    private readonly offices: OfficesService,
    private readonly desks: DesksService,
    private readonly realtime: RealtimeGateway
  ) {}

  @Post("desks")
  async create(
    @Param("officeId") officeId: string,
    @Body() body: { code?: unknown; x?: unknown; y?: unknown }
  ) {
    const walls = await this.walls(officeId);
    const placed = this.orFail(
      validateNewDesk(
        { id: body?.code, x: body?.x, y: body?.y },
        await this.desks.positions(officeId),
        walls
      )
    );

    const room = await this.applyRoom(officeId, walls, placed.room);
    const desk = await this.desks.add(officeId, placed.id, placed.x, placed.y);
    this.realtime.broadcast(officeId, {
      type: "desk_added",
      desk: { id: desk.id, code: desk.code, x: desk.x, y: desk.y, email: null, occupant: null },
    });
    return { id: desk.id, code: desk.code, x: desk.x, y: desk.y, room };
  }

  /** Moving a desk, renaming it, or both — the editor sends what changed. */
  @Patch("desks/:deskId")
  async move(
    @Param("officeId") officeId: string,
    @Param("deskId") deskId: string,
    @Body() body: { x?: unknown; y?: unknown; code?: unknown }
  ) {
    const desk = await this.deskOrFail(officeId, deskId);
    const positions = await this.desks.positions(officeId);

    // A rename on its own leaves the desk exactly where it is
    if (body?.code !== undefined) {
      const code = this.orFail(validateCode(body.code, positions, desk.code));
      const renamed = await this.desks.rename(desk, code);
      this.realtime.broadcast(officeId, { type: "desk_renamed", id: desk.id, code });
      if (body.x === undefined && body.y === undefined) {
        return { id: renamed.id, code, x: renamed.x, y: renamed.y, room: await this.walls(officeId) };
      }
    }

    const walls = await this.walls(officeId);
    const { x, y, room: needed } = this.orFail(
      validateMove({ id: desk.code, x: body?.x, y: body?.y }, positions, walls)
    );

    const room = await this.applyRoom(officeId, walls, needed);
    await this.desks.move(desk, x, y);

    // The occupant rides along, so a connected one has to be told where
    // they now stand
    const seated = this.realtime.onlineAtDesk(officeId, desk.id);
    if (seated) this.realtime.moveSessionTo(seated, x, y + SPAWN_OFFSET_Y);

    this.realtime.broadcast(officeId, { type: "desk_moved", id: desk.id, x, y });
    return { id: desk.id, code: desk.code, x, y, room };
  }

  @Delete("desks/:deskId")
  async remove(@Param("officeId") officeId: string, @Param("deskId") deskId: string) {
    const desk = await this.deskOrFail(officeId, deskId);
    await this.desks.remove(desk);

    // Their seat is what let them in; without it there is nobody to be
    if (desk.assignedEmail) this.realtime.evict(officeId, desk.assignedEmail, "seat_removed");
    this.realtime.broadcast(officeId, { type: "desk_removed", id: desk.id });
    return { id: desk.id };
  }

  /** Sits a member at a desk, or empties it. `email: null` clears the seat. */
  @Patch("desks/:deskId/occupant")
  async assign(
    @Param("officeId") officeId: string,
    @Param("deskId") deskId: string,
    @Body() body: { email?: unknown }
  ) {
    const desk = await this.deskOrFail(officeId, deskId);
    const raw = body?.email;
    const email = typeof raw === "string" && raw.trim() ? normaliseEmail(raw) : null;

    if (email && !(await this.offices.membershipFor(officeId, email))) {
      throw new BadRequestException({ error: "Add them to the member list first" });
    }

    const previous = desk.assignedEmail;
    const movedFrom = email ? await this.desks.seatOf(officeId, email) : null;
    await this.desks.assign(desk, email);

    // A session is tied to the desk it walked in at, so anyone whose seat
    // just changed underneath them starts again: the person who used to sit
    // here, and the person who has been moved here from somewhere else
    if (previous && previous !== email) {
      this.realtime.evict(officeId, previous, "seat_reassigned");
    }
    if (email && movedFrom && movedFrom.id !== desk.id) {
      this.realtime.evict(officeId, email, "seat_moved");
    }

    this.realtime.broadcast(officeId, { type: "seating_changed" });
    return this.desks.listWithOccupants(officeId);
  }

  /**
   * Resizing the walls by hand, which — unlike dragging a desk — may also
   * shrink the office.
   */
  @Patch("room")
  async setRoom(@Param("officeId") officeId: string, @Body() body: Partial<Room>) {
    const walls = await this.walls(officeId);
    const tidy = this.orFail(validateRoom(body, await this.desks.positions(officeId)));
    return { room: await this.applyRoom(officeId, walls, tidy) };
  }

  private async walls(officeId: string): Promise<Room> {
    return this.offices.getRoom(await this.offices.findOrFail(officeId));
  }

  private async deskOrFail(officeId: string, deskId: string) {
    const desk = await this.desks.byId(officeId, deskId);
    if (!desk) throw new NotFoundException({ error: "That desk is gone" });
    return desk;
  }

  /**
   * Stores a room the layout rules asked for and tells everyone the walls
   * moved. A no-op when the desk already fitted, which is the common case.
   */
  private async applyRoom(officeId: string, current: Room, wanted: Room): Promise<Room> {
    if (sameRoom(wanted, current)) return current;
    await this.offices.saveRoom(officeId, wanted);
    this.realtime.broadcast(officeId, { type: "room_resized", room: wanted });
    return wanted;
  }

  /** A failed check is the editor's error message, verbatim, as a 400. */
  private orFail<T>(check: Checked<T>): T {
    if (!check.ok) throw new BadRequestException({ error: check.error });
    return check.value;
  }
}
