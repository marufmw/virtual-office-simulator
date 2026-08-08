import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import { AuthService, SessionUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import type { MemberRole } from "../database/entities/membership.entity";
import { DesksService } from "../offices/desks.service";
import {
  OfficeAdminGuard,
  OfficeMemberGuard,
  OfficeRequest,
} from "../offices/office-access.guard";
import { OfficesService } from "../offices/offices.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

/**
 * Offices, and who is in them. Everything here needs a signed-in caller;
 * anything that changes an office needs its admin.
 */
@Controller("api/offices")
@UseGuards(AuthGuard)
export class OfficesController {
  constructor(
    private readonly offices: OfficesService,
    private readonly desks: DesksService,
    private readonly realtime: RealtimeGateway
  ) {}

  /** Every office this person has been let into */
  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.offices.listFor(user.email);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: { name?: unknown }) {
    const created = await this.offices.create(user, body?.name);
    // Read it back the way the picker sees it, seat and all
    return (await this.offices.listFor(user.email)).find((o) => o.id === created.id) ?? created;
  }

  /** The floor plan, for the office view and the editor alike */
  @Get(":officeId")
  @UseGuards(OfficeMemberGuard)
  async detail(@Param("officeId") officeId: string, @Req() request: OfficeRequest) {
    const office = await this.offices.findOrFail(officeId);
    const seat = await this.desks.seatOf(officeId, request.user.email);
    return {
      office: { id: office.id, name: office.name },
      role: request.membership.role,
      room: this.offices.getRoom(office),
      desks: await this.desks.listWithOccupants(officeId),
      seat: seat ? { id: seat.id, code: seat.code } : null,
    };
  }

  @Patch(":officeId")
  @UseGuards(OfficeAdminGuard)
  async rename(@Param("officeId") officeId: string, @Body() body: { name?: unknown }) {
    const renamed = await this.offices.rename(officeId, body?.name);
    this.realtime.broadcast(officeId, { type: "office_renamed", name: renamed.name });
    return renamed;
  }

  @Delete(":officeId")
  @UseGuards(OfficeAdminGuard)
  async remove(@Param("officeId") officeId: string) {
    for (const member of await this.offices.members(officeId)) {
      this.realtime.evict(officeId, member.email, "office_closed");
    }
    await this.offices.remove(officeId);
    return { id: officeId };
  }

  // --- The member list -----------------------------------------------------

  @Get(":officeId/members")
  @UseGuards(OfficeMemberGuard)
  members(@Param("officeId") officeId: string) {
    return this.offices.members(officeId);
  }

  @Post(":officeId/members")
  @UseGuards(OfficeAdminGuard)
  async addMember(@Param("officeId") officeId: string, @Body() body: { email?: unknown }) {
    const { member, desk, room, created } = await this.offices.addMember(officeId, body?.email);
    // A new member arrives with a desk, and when the office was full that
    // is a desk which didn't exist a moment ago — anyone standing in the
    // room should see it appear, and the walls move if they had to
    if (created) {
      this.realtime.broadcast(officeId, { type: "room_resized", room });
      this.realtime.broadcast(officeId, {
        type: "desk_added",
        desk: { id: desk.id, code: desk.code, x: desk.x, y: desk.y },
      });
    }
    this.realtime.broadcast(officeId, { type: "seating_changed" });
    return member;
  }

  @Patch(":officeId/members/:email")
  @UseGuards(OfficeAdminGuard)
  setRole(
    @Param("officeId") officeId: string,
    @Param("email") email: string,
    @Body() body: { role?: MemberRole }
  ) {
    return this.offices.setRole(officeId, email, body?.role === "admin" ? "admin" : "member");
  }

  @Delete(":officeId/members/:email")
  @UseGuards(OfficeAdminGuard)
  @HttpCode(200)
  async removeMember(@Param("officeId") officeId: string, @Param("email") email: string) {
    const removed = await this.offices.removeMember(officeId, email);
    // Their desk went with them, so anyone still walking around as them is
    // shown the door rather than left as a character nobody is
    this.realtime.evict(officeId, removed.email, "removed");
    this.realtime.broadcast(officeId, { type: "seating_changed" });
    return removed;
  }
}

/** Not an office of its own: what the app asks before it draws anything. */
@Controller("api/session")
export class SessionController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @UseGuards(AuthGuard)
  session(@CurrentUser() user: SessionUser) {
    return { user, googleEnabled: this.auth.googleEnabled };
  }
}
