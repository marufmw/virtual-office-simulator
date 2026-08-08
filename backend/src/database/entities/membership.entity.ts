import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type MemberRole = "admin" | "member";

/**
 * Somebody the admin has let into an office, by email.
 *
 * A membership is written before that person has ever signed in — the
 * admin types an email, and whoever turns up holding it is that member. So
 * this points at an address, not at a user row.
 */
@Entity({ name: "memberships" })
@Index("memberships_office_email", ["officeId", "email"], { unique: true })
@Index("memberships_email", ["email"])
export class Membership {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "office_id", type: "uuid" })
  officeId: string;

  @Column({ type: "text" })
  email: string;

  @Column({ type: "text", default: "member" })
  role: MemberRole;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
