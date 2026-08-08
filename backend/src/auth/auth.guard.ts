import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthService, SessionUser } from "./auth.service";

/** The request, once the guard has said who is making it. */
export interface AuthedRequest extends Request {
  user: SessionUser;
}

/** Bearer token, or nothing doing. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    const user = await this.auth.verify(token);
    if (!user) throw new UnauthorizedException({ error: "Sign in first" });

    request.user = user;
    return true;
  }
}
