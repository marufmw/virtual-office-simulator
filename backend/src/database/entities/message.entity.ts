import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * One line of a one-on-one chat. Addressed by desk, not by session, so the
 * history survives everyone going home for the night.
 */
@Entity({ name: "messages" })
@Index("messages_pair", ["fromDesk", "toDesk", "createdAt"])
export class Message {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "from_desk", type: "text" })
  fromDesk: string;

  @Column({ name: "to_desk", type: "text" })
  toDesk: string;

  @Column({ type: "text" })
  body: string;

  // Milliseconds since the epoch. bigint comes back from pg as a string, so
  // callers convert on the way out.
  @Column({ name: "created_at", type: "bigint" })
  createdAt: string;
}
