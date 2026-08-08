import { Column, Entity, PrimaryColumn } from "typeorm";

import type { BoardElement } from "../../realtime/board.store";

/**
 * What's drawn on a whiteboard, as the Excalidraw element array. One row per
 * board; the office has one, but nothing here assumes that.
 */
@Entity({ name: "boards" })
export class Board {
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ type: "jsonb" })
  scene: BoardElement[];

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: string;
}
