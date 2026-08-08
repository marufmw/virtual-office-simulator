import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * The person who sits at a desk. Keyed on the desk rather than on the
 * person: a seat holds one character, and whoever connects to it drives it.
 *
 * `character` is a type name in SQL, so the column keeps its explicit name
 * and TypeORM quotes it for us.
 */
@Entity({ name: "players" })
export class Player {
  @PrimaryColumn({ name: "desk_id", type: "text" })
  deskId: string;

  @Column({ type: "text" })
  name: string;

  @Column({ name: "character", type: "text" })
  character: string;

  @Column({ type: "double precision", default: 0 })
  x: number;

  @Column({ type: "double precision", default: 0 })
  y: number;
}
