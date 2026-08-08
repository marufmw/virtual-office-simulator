import { ExecutionContext, createParamDecorator } from "@nestjs/common";

import type { AuthedRequest } from "./auth.guard";
import type { SessionUser } from "./auth.service";

/** Whoever the AuthGuard let through. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser =>
    context.switchToHttp().getRequest<AuthedRequest>().user
);
