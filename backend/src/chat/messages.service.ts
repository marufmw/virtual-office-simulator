import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Message } from "../database/entities/message.entity";

/** One line of a chat, in the shape the clients render */
export interface ChatLine {
  fromEmail: string;
  toEmail: string;
  body: string;
  createdAt: number;
}

@Injectable()
export class MessagesService {
  constructor(@InjectRepository(Message) private readonly messages: Repository<Message>) {}

  async save(
    officeId: string,
    fromEmail: string,
    toEmail: string,
    body: string,
    createdAt: number
  ): Promise<void> {
    await this.messages.insert({
      officeId,
      fromEmail,
      toEmail,
      body,
      createdAt: String(createdAt),
    });
  }

  /** Full chat history between two people in one office, oldest first */
  async loadConversation(officeId: string, a: string, b: string): Promise<ChatLine[]> {
    const rows = await this.messages
      .createQueryBuilder("m")
      .where("m.officeId = :officeId", { officeId })
      .andWhere(
        "((m.fromEmail = :a AND m.toEmail = :b) OR (m.fromEmail = :b AND m.toEmail = :a))",
        { a, b }
      )
      .orderBy("m.createdAt", "ASC")
      .addOrderBy("m.id", "ASC")
      .getMany();

    return rows.map((m) => ({
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      body: m.body,
      // bigint comes back as a string; timestamps are numbers on the wire
      createdAt: Number(m.createdAt),
    }));
  }
}
