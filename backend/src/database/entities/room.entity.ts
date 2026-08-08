import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * The room's wall centrelines. One row — id is pinned to 1 by a check
 * constraint — grown as desks are dragged outward.
 */
@Entity({ name: "room" })
export class RoomRow {
  @PrimaryColumn({ type: "integer" })
  id: number;

  @Column({ name: "min_x", type: "double precision" })
  minX: number;

  @Column({ name: "max_x", type: "double precision" })
  maxX: number;

  @Column({ name: "min_y", type: "double precision" })
  minY: number;

  @Column({ name: "max_y", type: "double precision" })
  maxY: number;
}
