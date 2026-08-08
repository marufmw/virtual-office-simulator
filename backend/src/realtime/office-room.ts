import type { WebSocket } from "ws";

import { BoardStore } from "./board.store";
import { HuddleStore } from "./huddle.store";

/** Somebody in an office right now, and the socket driving them. */
export interface Session {
  id: number;
  ws: WebSocket;
  officeId: string;
  email: string;
  name: string;
  deskId: string;
  deskCode: string;
  x: number;
  y: number;
  color: string;
  character: string;
  /** Hands the character to another client of the same person */
  demote: () => void;
}

/**
 * One office's live state. Offices are sealed off from each other: a
 * broadcast, a huddle and a whiteboard all belong to exactly one of them.
 */
export class OfficeRoom {
  readonly players = new Map<number, Session>();
  readonly huddles = new HuddleStore();
  readonly board = new BoardStore();

  /** Set whenever someone moves, joins or leaves */
  worldMoved = true;

  /** Whether the whiteboard has been read from the database yet */
  boardLoaded = false;

  constructor(readonly officeId: string) {}

  get empty(): boolean {
    return this.players.size === 0;
  }
}
