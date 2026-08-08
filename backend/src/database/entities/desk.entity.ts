import { Column, Entity, PrimaryColumn } from "typeorm";

/** A desk on the floor plan. The id is the code written on it, e.g. TB-110. */
@Entity({ name: "desks" })
export class Desk {
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ type: "double precision" })
  x: number;

  @Column({ type: "double precision" })
  y: number;
}
