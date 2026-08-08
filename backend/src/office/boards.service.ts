import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { Board } from "../database/entities/board.entity";
import type { BoardElement } from "../realtime/board.store";

/** Where a whiteboard's scene is kept between sessions. */
@Injectable()
export class BoardsService {
  constructor(@InjectRepository(Board) private readonly boards: Repository<Board>) {}

  async load(id: string): Promise<BoardElement[]> {
    const row = await this.boards.findOneBy({ id });
    return row?.scene ?? [];
  }

  async save(id: string, scene: BoardElement[], updatedAt: number): Promise<void> {
    // The scene is JSON we store whole rather than a graph of columns, so
    // TypeORM's deep-partial view of it doesn't apply
    const row = { id, scene, updatedAt: String(updatedAt) } as QueryDeepPartialEntity<Board>;
    await this.boards.upsert(row, ["id"]);
  }
}
