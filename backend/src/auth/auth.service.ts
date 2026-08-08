import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { OAuth2Client } from "google-auth-library";
import { Repository } from "typeorm";

import { User } from "../database/entities/user.entity";

/** Who a request is from, once its token has been checked. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

const SESSION_TTL = "30d";

/** Emails are the identity here, so they are compared in one case only. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  private readonly google = this.googleClientId ? new OAuth2Client(this.googleClientId) : null;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService
  ) {
    if (!this.google) {
      this.logger.warn(
        "GOOGLE_CLIENT_ID is not set — Google sign-in is off and the development door is open instead"
      );
    }
  }

  /** Whether real Google sign-in is available, as the sign-in page asks. */
  get googleEnabled(): boolean {
    return this.google !== null;
  }

  get clientId(): string | null {
    return this.googleClientId ?? null;
  }

  /**
   * Only when Google is not configured: sign in as any email at all. This
   * is how the office runs on a laptop before anyone has been to the Google
   * console, and it is refused outright in production.
   */
  get devDoorOpen(): boolean {
    return !this.google && process.env.NODE_ENV !== "production";
  }

  /**
   * Checks the ID token the browser got from Google and turns it into one
   * of our own sessions. The token is verified against Google's keys — it
   * arrives from the client, so nothing in it is taken on trust.
   */
  async signInWithGoogle(credential: string): Promise<{ token: string; user: SessionUser }> {
    if (!this.google) throw new UnauthorizedException("Google sign-in is not configured");

    let payload;
    try {
      const ticket = await this.google.verifyIdToken({
        idToken: credential,
        audience: this.googleClientId!,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Rejected a Google credential: ${(error as Error).message}`);
      throw new UnauthorizedException("That sign-in didn't check out");
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException("That Google account has no verified email");
    }

    return this.issue(
      await this.upsertUser({
        email: payload.email,
        name: payload.name ?? payload.email,
        picture: payload.picture ?? null,
      })
    );
  }

  /** The development door: an email, no proof. Never open in production. */
  async signInAsDeveloper(email: string, name?: string): Promise<{ token: string; user: SessionUser }> {
    if (!this.devDoorOpen) throw new UnauthorizedException("Sign in with Google");
    const address = normaliseEmail(email ?? "");
    if (!address.includes("@")) throw new UnauthorizedException("That isn't an email address");

    return this.issue(
      await this.upsertUser({ email: address, name: name?.trim() || address.split("@")[0], picture: null })
    );
  }

  /** Reads a session token back. Returns null for anything not ours. */
  async verify(token: string | undefined | null): Promise<SessionUser | null> {
    if (!token) return null;
    try {
      const claims = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.users.findOneBy({ id: claims.sub });
      return user ? this.publicUser(user) : null;
    } catch {
      return null;
    }
  }

  private async upsertUser(profile: {
    email: string;
    name: string;
    picture: string | null;
  }): Promise<User> {
    const email = normaliseEmail(profile.email);
    const existing = await this.users.findOneBy({ email });
    if (existing) {
      // A name or avatar can change at Google's end; the email can't
      existing.name = profile.name;
      existing.picture = profile.picture;
      return this.users.save(existing);
    }
    return this.users.save(this.users.create({ ...profile, email }));
  }

  private async issue(user: User): Promise<{ token: string; user: SessionUser }> {
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: SESSION_TTL }
    );
    return { token, user: this.publicUser(user) };
  }

  private publicUser = (user: User): SessionUser => ({
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  });
}
