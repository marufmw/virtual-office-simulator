import { randomBytes } from "node:crypto";

import { Global, Logger, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../database/entities/user.entity";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

/**
 * The secret sessions are signed with. Set SESSION_SECRET in production —
 * without it every restart invents a new one, which is fine on a laptop and
 * would sign everybody out on each deploy.
 */
function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  new Logger("AuthModule").warn(
    "SESSION_SECRET is not set — signing sessions with a key that lasts until restart"
  );
  return randomBytes(32).toString("hex");
}

// Global: the gateway authenticates its sockets with the same service
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({ secret: sessionSecret() }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
