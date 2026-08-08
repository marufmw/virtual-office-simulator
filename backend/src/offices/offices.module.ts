import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Board } from "../database/entities/board.entity";
import { Desk } from "../database/entities/desk.entity";
import { Membership } from "../database/entities/membership.entity";
import { Message } from "../database/entities/message.entity";
import { Office } from "../database/entities/office.entity";
import { User } from "../database/entities/user.entity";
import { MessagesService } from "../chat/messages.service";
import { BoardsService } from "./boards.service";
import { DesksService } from "./desks.service";
import { OfficeAdminGuard, OfficeMemberGuard } from "./office-access.guard";
import { OfficesService } from "./offices.service";

/**
 * Everything an office keeps: its walls, its desks, its member list, its
 * chats and its whiteboard. No transport of its own — the controllers and
 * the WebSocket gateway both sit on top of this.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Office, Membership, Desk, Message, Board])],
  providers: [
    OfficesService,
    DesksService,
    MessagesService,
    BoardsService,
    OfficeMemberGuard,
    OfficeAdminGuard,
  ],
  exports: [
    OfficesService,
    DesksService,
    MessagesService,
    BoardsService,
    OfficeMemberGuard,
    OfficeAdminGuard,
  ],
})
export class OfficesModule {}
