import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Somebody who has signed in with Google. The email is the identity the
 * whole office runs on — memberships and desks are addressed by it, and it
 * is stored lowercased so a capital letter never costs someone their seat.
 */
@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "text", unique: true })
  email: string;

  @Column({ type: "text" })
  name: string;

  @Column({ type: "text", nullable: true })
  picture: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
