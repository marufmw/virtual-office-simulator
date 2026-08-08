import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * One line of a one-on-one chat, inside one office.
 *
 * Addressed by email rather than by desk: people are moved around the floor
 * plan by the admin, and a conversation belongs to the person, not the seat.
 */
@Entity({ name: "messages" })
@Index("messages_pair", ["officeId", "fromEmail", "toEmail", "createdAt"])
export class Message {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "office_id", type: "uuid" })
  officeId: string;

  @Column({ name: "from_email", type: "text" })
  fromEmail: string;

  @Column({ name: "to_email", type: "text" })
  toEmail: string;

  @Column({ type: "text" })
  body: string;

  // Milliseconds since the epoch. bigint comes back from pg as a string, so
  // callers convert on the way out.
  @Column({ name: "created_at", type: "bigint" })
  createdAt: string;
}
