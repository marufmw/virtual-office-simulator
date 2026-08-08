import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Message } from "../database/entities/message.entity";

/** One line of a chat, in the shape the clients render */
export interface ChatLine {
  fromDesk: string;
  toDesk: string;
  body: string;
  createdAt: number;
}

@Injectable()
export class MessagesService {
  constructor(@InjectRepository(Message) private readonly messages: Repository<Message>) {}

  async save(fromDesk: string, toDesk: string, body: string, createdAt: number): Promise<void> {
    await this.messages.insert({ fromDesk, toDesk, body, createdAt: String(createdAt) });
  }

  /** Full chat history between two desks, oldest first */
  async loadConversation(deskA: string, deskB: string): Promise<ChatLine[]> {
    const rows = await this.messages
      .createQueryBuilder("m")
      .where(
        "(m.fromDesk = :a AND m.toDesk = :b) OR (m.fromDesk = :b AND m.toDesk = :a)",
        { a: deskA, b: deskB }
      )
      .orderBy("m.createdAt", "ASC")
      .addOrderBy("m.id", "ASC")
      .getMany();

    return rows.map((m) => ({
      fromDesk: m.fromDesk,
      toDesk: m.toDesk,
      body: m.body,
      // bigint comes back as a string; timestamps are numbers on the wire
      createdAt: Number(m.createdAt),
    }));
  }
}
