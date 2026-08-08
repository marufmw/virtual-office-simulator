import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Board } from "../database/entities/board.entity";
import { Desk } from "../database/entities/desk.entity";
import { Message } from "../database/entities/message.entity";
import { Player } from "../database/entities/player.entity";
import { RoomRow } from "../database/entities/room.entity";
import { BoardsService } from "./boards.service";
import { MessagesService } from "./messages.service";
import { OfficeService } from "./office.service";

/**
 * Everything the office keeps: desks, people, chats and whiteboards. No
 * transport of its own — the REST controllers and the WebSocket gateway
 * both sit on top of this.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Desk, Player, RoomRow, Message, Board])],
  providers: [OfficeService, MessagesService, BoardsService],
  exports: [OfficeService, MessagesService, BoardsService],
})
export class OfficeModule {}
