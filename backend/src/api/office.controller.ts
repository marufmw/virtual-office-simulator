import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import {
  Checked,
  Room,
  sameRoom,
  validateMove,
  validateNewDesk,
  validateReseat,
  validateRoom,
} from "../office/layout";
import { MAX_NAME_LENGTH } from "../realtime/realtime.constants";
import { OfficeService } from "../office/office.service";
import { SPAWN_OFFSET_Y } from "../office/office.constants";
import { RealtimeGateway } from "../realtime/realtime.gateway";

/**
 * The desk list and floor-plan editing. Everything that happens once you're
 * in the room is WebSocket; this is what the editor and the seat picker
 * talk to.
 *
 * The layout rules live in `layout.ts` and return messages written for the
 * person editing, so they are handed straight back as the 400 body rather
 * than run through a validation pipe.
 */
@Controller("api")
export class OfficeController {
  constructor(
    private readonly office: OfficeService,
    private readonly realtime: RealtimeGateway
  ) {}

  /** The whole floor plan: the room's walls plus every desk in it */
  @Get("office")
  async getOffice() {
    return { room: await this.office.getRoom(), desks: await this.office.loadDesksWithStatus() };
  }

  @Get("desks")
  getDesks() {
    return this.office.loadDesksWithStatus();
  }

  @Post("desks")
  async createDesk(@Body() body: { id?: unknown; x?: unknown; y?: unknown }) {
    const check = validateNewDesk(
      body ?? {},
      await this.office.loadDesks(),
      await this.requireRoom()
    );
    const placed = this.orFail(check);

    const room = await this.applyRoom(placed.room);
    const desk = await this.office.addDesk(placed.id, placed.x, placed.y);
    this.realtime.broadcast({ type: "desk_added", desk });
    return { ...desk, room };
  }

  /**
   * Resizing the walls by hand, which — unlike dragging a desk — may also
   * shrink the office.
   */
  @Patch("room")
  async setRoom(@Body() body: Partial<Room>) {
    const tidy = this.orFail(validateRoom(body, await this.office.loadDesks()));
    return { room: await this.applyRoom(tidy) };
  }

  @Patch("desks/:id")
  async moveDesk(@Param("id") id: string, @Body() body: { x?: unknown; y?: unknown }) {
    const check = validateMove(
      { id, x: body?.x, y: body?.y },
      await this.office.loadDesks(),
      await this.requireRoom()
    );
    const { x, y, room: needed } = this.orFail(check);

    const room = await this.applyRoom(needed);
    await this.office.moveDesk(id, x, y);

    // The occupant rides along, so a connected one has to be told where
    // they now stand
    const seated = this.realtime.onlinePlayerAtDesk(id);
    if (seated) this.realtime.moveSessionTo(seated, x, y + SPAWN_OFFSET_Y);

    this.realtime.broadcast({ type: "desk_moved", id, x, y });
    return { id, x, y, room };
  }

  @Delete("desks/:id")
  async removeDesk(@Param("id") id: string) {
    if (!(await this.office.getDesk(id))) throw new NotFoundException({ error: "That desk is gone" });
    if (await this.office.getPlayer(id)) {
      throw new ConflictException({ error: "Move whoever sits there first" });
    }

    await this.office.removeDesk(id);
    this.realtime.broadcast({ type: "desk_removed", id });
    return { id };
  }

  /**
   * Renaming whoever sits at a desk, from the layout editor. Reseating them
   * is /api/reseat; this is about the person, not the seat.
   */
  @Patch("desks/:id/occupant")
  async renameOccupant(@Param("id") deskId: string, @Body() body: { name?: unknown }) {
    const seated = await this.office.getPlayer(deskId);
    if (!seated) throw new NotFoundException({ error: "Nobody sits there" });

    const name =
      typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (!name) throw new BadRequestException({ error: "A name can't be empty" });

    await this.office.updateProfile(deskId, { deskId, name, character: seated.character });
    // Whoever is playing them right now should see it too
    const session = this.realtime.onlinePlayerAtDesk(deskId);
    if (session) this.realtime.renameSession(session, name);

    this.realtime.broadcast({ type: "occupant_renamed", id: deskId, name });
    return { id: deskId, name };
  }

  @Delete("desks/:id/occupant")
  async clearSeat(@Param("id") deskId: string) {
    if (!(await this.office.getPlayer(deskId))) {
      throw new NotFoundException({ error: "Nobody sits there" });
    }
    // Someone still connected would be left as a character nobody is, so the
    // seat is only cleared once they've gone — the same rule that stops a
    // desk being deleted out from under its occupant
    if (this.realtime.onlinePlayerAtDesk(deskId)) {
      throw new ConflictException({ error: "They're here right now — ask them to leave" });
    }

    await this.office.clearSeat(deskId);
    this.realtime.broadcast({ type: "desk_vacated", id: deskId });
    return { id: deskId };
  }

  @Post("reseat")
  @HttpCode(200)
  async reseat(@Body() body: { fromDeskId?: unknown; toDeskId?: unknown }) {
    // Occupancy is read once up front so the validator stays synchronous
    const seating = await this.office.loadDesksWithStatus();
    const occupied = new Set(seating.filter((d) => d.occupant).map((d) => d.id));
    const { fromDeskId, toDeskId, swap } = this.orFail(
      validateReseat(body ?? {}, seating, (deskId) => occupied.has(deskId))
    );

    // Sessions have to be looked up before the desk ids move underneath them
    const mover = this.realtime.onlinePlayerAtDesk(fromDeskId);
    const displaced = swap ? this.realtime.onlinePlayerAtDesk(toDeskId) : null;

    if (swap) {
      const seats = await this.office.swapSeats(fromDeskId, toDeskId);
      if (!seats) throw new ConflictException({ error: "Those seats just changed" });
      this.realtime.seatSession(mover, seats[toDeskId]);
      this.realtime.seatSession(displaced, seats[fromDeskId]);
    } else {
      this.realtime.seatSession(mover, await this.office.reseatPlayer(fromDeskId, toDeskId));
    }

    return { fromDeskId, toDeskId, swapped: swap };
  }

  @Post("layout/reset")
  @HttpCode(200)
  async resetLayout() {
    await this.office.resetLayout();
    // Everyone's seat just changed underneath them; simplest honest thing
    // is to have the clients reload into the fresh office
    this.realtime.broadcast({ type: "layout_reset" });
    return { room: await this.office.getRoom(), desks: await this.office.loadDesksWithStatus() };
  }

  /**
   * Stores a room the layout rules asked for and tells everyone the walls
   * moved. A no-op when the desk already fitted, which is the common case.
   */
  private async applyRoom(room: Room): Promise<Room> {
    if (sameRoom(room, await this.requireRoom())) return room;
    await this.office.saveRoom(room);
    this.realtime.broadcast({ type: "room_resized", room });
    return room;
  }

  private async requireRoom(): Promise<Room> {
    const room = await this.office.getRoom();
    if (!room) throw new NotFoundException({ error: "The office has no walls yet" });
    return room;
  }

  /** A failed check is the editor's error message, verbatim, as a 400. */
  private orFail<T>(check: Checked<T>): T {
    if (!check.ok) throw new BadRequestException({ error: check.error });
    return check.value;
  }
}
