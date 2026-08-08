import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A desk on an office's floor plan, and the seat that goes with it.
 *
 * Seating is the admin's to decide: a desk carries the email of whoever
 * sits there, and a member with no desk cannot walk in. The person's
 * character and where they were last standing ride along on the desk,
 * because there is exactly one of them per seat.
 */
@Entity({ name: "desks" })
@Index("desks_office_code", ["officeId", "code"], { unique: true })
@Index("desks_office_email", ["officeId", "assignedEmail"], {
  unique: true,
  where: '"assigned_email" IS NOT NULL',
})
export class Desk {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "office_id", type: "uuid" })
  officeId: string;

  /** The code written on the desk, e.g. TB-110. Unique within its office. */
  @Column({ type: "text" })
  code: string;

  @Column({ type: "double precision" })
  x: number;

  @Column({ type: "double precision" })
  y: number;

  /** Whoever the admin sat here, or null for an empty desk */
  @Column({ name: "assigned_email", type: "text", nullable: true })
  assignedEmail: string | null;

  @Column({ name: "character", type: "text", nullable: true })
  character: string | null;

  /** Where the occupant was last standing, so they come back to it */
  @Column({ name: "stand_x", type: "double precision", nullable: true })
  standX: number | null;

  @Column({ name: "stand_y", type: "double precision", nullable: true })
  standY: number | null;
}
