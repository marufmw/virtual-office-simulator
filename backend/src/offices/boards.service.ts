import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { Board } from "../database/entities/board.entity";
import type { BoardElement } from "../realtime/board.store";

/** Where an office's whiteboard is kept between sessions. */
@Injectable()
export class BoardsService {
  constructor(@InjectRepository(Board) private readonly boards: Repository<Board>) {}

  async load(officeId: string): Promise<BoardElement[]> {
    const row = await this.boards.findOneBy({ officeId });
    return row?.scene ?? [];
  }

  async save(officeId: string, scene: BoardElement[], updatedAt: number): Promise<void> {
    // The scene is JSON we store whole rather than a graph of columns, so
    // TypeORM's deep-partial view of it doesn't apply
    const row = { officeId, scene, updatedAt: String(updatedAt) } as QueryDeepPartialEntity<Board>;
    await this.boards.upsert(row, ["officeId"]);
  }
}
