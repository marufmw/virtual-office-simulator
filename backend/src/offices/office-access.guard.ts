import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import type { AuthedRequest } from "../auth/auth.guard";
import type { Membership } from "../database/entities/membership.entity";
import { OfficesService } from "./offices.service";

export interface OfficeRequest extends AuthedRequest {
  membership: Membership;
}

/** In the office, or not in it. Runs after AuthGuard, which names the user. */
@Injectable()
export class OfficeMemberGuard implements CanActivate {
  constructor(protected readonly offices: OfficesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OfficeRequest>();
    const officeId = String(request.params?.officeId ?? "");

    const membership = officeId
      ? await this.offices.membershipFor(officeId, request.user.email)
      : null;
    // The same answer whether the office doesn't exist or isn't theirs:
    // an outsider learns nothing either way
    if (!membership) throw new ForbiddenException({ error: "That office isn't yours to open" });

    request.membership = membership;
    return true;
  }
}

/** Editing the floor plan and the member list is the admin's alone. */
@Injectable()
export class OfficeAdminGuard extends OfficeMemberGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<OfficeRequest>();
    if (request.membership.role !== "admin") {
      throw new ForbiddenException({ error: "Only an admin can change this office" });
    }
    return true;
  }
}
