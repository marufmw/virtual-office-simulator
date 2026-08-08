import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";

import { AuthGuard } from "./auth.guard";
import { AuthService, SessionUser } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** What the sign-in page needs to know before it can draw itself */
  @Get("config")
  config() {
    return { googleClientId: this.auth.clientId, devSignIn: this.auth.devDoorOpen };
  }

  @Post("google")
  @HttpCode(200)
  signInWithGoogle(@Body() body: { credential?: string }) {
    return this.auth.signInWithGoogle(body?.credential ?? "");
  }

  /** Only answers at all when Google isn't configured; see AuthService */
  @Post("dev")
  @HttpCode(200)
  signInAsDeveloper(@Body() body: { email?: string; name?: string }) {
    return this.auth.signInAsDeveloper(body?.email ?? "", body?.name);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: SessionUser) {
    return user;
  }
}
