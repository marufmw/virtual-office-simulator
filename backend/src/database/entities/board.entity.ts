import { Column, Entity, PrimaryColumn } from "typeorm";

import type { BoardElement } from "../../realtime/board.store";

/**
 * What's drawn on an office's whiteboard, as the Excalidraw element array.
 * One board per office, which is why the office's id is the key.
 */
@Entity({ name: "boards" })
export class Board {
  @PrimaryColumn({ name: "office_id", type: "uuid" })
  officeId: string;

  @Column({ type: "jsonb" })
  scene: BoardElement[];

  @Column({ name: "updated_at", type: "bigint" })
  updatedAt: string;
}
