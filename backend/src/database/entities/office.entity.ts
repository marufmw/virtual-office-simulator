import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * One office: a floor plan, the people allowed in it, and a whiteboard.
 *
 * The walls live here rather than in a table of their own — there is one
 * room per office, and it grows as desks are dragged outward.
 */
@Entity({ name: "offices" })
export class Office {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "text" })
  name: string;

  @Column({ name: "min_x", type: "double precision" })
  minX: number;

  @Column({ name: "max_x", type: "double precision" })
  maxX: number;

  @Column({ name: "min_y", type: "double precision" })
  minY: number;

  @Column({ name: "max_y", type: "double precision" })
  maxY: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
