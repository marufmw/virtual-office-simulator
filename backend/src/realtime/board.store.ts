// The office whiteboard. Where a huddle forms around whoever is standing
// together, a board session forms around a fixed spot on the wall: walk up
// to it and you're in, walk away and you're out.
//
// Unlike a huddle, what's drawn outlives the people drawing it, so the
// scene is kept here and written to the database.

import { Room } from "../offices/layout";

export const BOARD_RANGE = 4.5; // how close you stand to take part
export const BOARD_INSET = 2; // how far in front of the wall the board's spot sits
const MAX_ELEMENTS = 5000; // a runaway scene is a broken one, not a busy one

/**
 * An Excalidraw element. Only the bookkeeping fields matter here — the rest
 * of the shape is the client's business and is passed through untouched.
 */
export interface BoardElement {
  id: string;
  version?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export interface Position {
  x: number;
  y: number;
}

/**
 * Where the board hangs: the middle of the top wall, with the standing spot
 * just inside the room. Derived from the room rather than stored, so it
 * follows the walls when the office is resized — the frontend works it out
 * the same way.
 */
export function boardAnchor(room: Room): Position {
  return { x: (room.minX + room.maxX) / 2, y: room.maxY - BOARD_INSET };
}

const inRange = (position: Position, anchor: Position) =>
  Math.hypot(position.x - anchor.x, position.y - anchor.y) <= BOARD_RANGE;

/**
 * Which of two versions of the same element to keep.
 *
 * Excalidraw stamps every element with a `version` that counts up on each
 * edit, and a random `versionNonce`. Higher version wins; when two people
 * edited from the same version, the nonce breaks the tie the same way on
 * every client, so everyone converges on the same drawing rather than
 * quietly disagreeing about it.
 */
function newer(incoming: BoardElement, existing: BoardElement | undefined): boolean {
  if (!existing) return true;
  const a = incoming.version ?? 0;
  const b = existing.version ?? 0;
  if (a !== b) return a > b;
  return (incoming.versionNonce ?? 0) > (existing.versionNonce ?? 0);
}

export class BoardStore {
  private readonly elements = new Map<string, BoardElement>();
  private near = new Set<number>();
  private changed = false;

  /** Who is standing at the board right now */
  get members(): ReadonlySet<number> {
    return this.near;
  }

  /** Whether the scene has moved on since it was last written down */
  get dirty(): boolean {
    return this.changed;
  }

  snapshot(): BoardElement[] {
    return [...this.elements.values()];
  }

  /** Replaces the scene wholesale, for loading what was saved. */
  load(saved: BoardElement[] | null | undefined): void {
    this.elements.clear();
    for (const element of saved ?? []) {
      if (element?.id) this.elements.set(element.id, element);
    }
    this.changed = false;
  }

  markSaved(): void {
    this.changed = false;
  }

  /**
   * Folds someone's edits into the scene. Returns only the elements that
   * actually won, so a client echoing back a stale copy of something
   * doesn't get rebroadcast to everyone as news.
   */
  merge(incoming: BoardElement[] | null | undefined): BoardElement[] {
    const accepted: BoardElement[] = [];
    for (const element of incoming ?? []) {
      if (!element?.id) continue;
      if (!newer(element, this.elements.get(element.id))) continue;
      this.elements.set(element.id, element);
      accepted.push(element);
    }
    if (accepted.length > 0) this.changed = true;

    // Something has gone wrong upstream if we ever hit this; drop the
    // oldest tombstones rather than grow without limit
    if (this.elements.size > MAX_ELEMENTS) {
      for (const [id, element] of this.elements) {
        if (this.elements.size <= MAX_ELEMENTS) break;
        if (element.isDeleted) this.elements.delete(id);
      }
    }
    return accepted;
  }

  /**
   * Recomputes who is standing at the board. Returns `{ playerId, near }`
   * for the people whose situation changed — nothing for a world where
   * everyone stayed put relative to it.
   */
  sync(
    players: Iterable<[number, Position]>,
    room: Room
  ): Array<{ playerId: number; near: boolean }> {
    const anchor = boardAnchor(room);
    const next = new Set<number>();
    for (const [id, position] of players) {
      if (inRange(position, anchor)) next.add(id);
    }

    const changes: Array<{ playerId: number; near: boolean }> = [];
    for (const id of next) if (!this.near.has(id)) changes.push({ playerId: id, near: true });
    for (const id of this.near) if (!next.has(id)) changes.push({ playerId: id, near: false });

    this.near = next;
    return changes;
  }

  /** Someone disconnected: they are no longer at the board. */
  remove(playerId: number): void {
    this.near.delete(playerId);
  }
}
