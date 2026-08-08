// Proximity group chat. A huddle is a connected component of players who
// are standing close enough to talk: if A can hear B and B can hear C, all
// three share one conversation even when A and C are further apart.
//
// Huddles live only in memory — they exist while people stand together and
// are forgotten once the group breaks up.

import { Position } from "./board.store";

export const HUDDLE_DISTANCE = 2.5; // mirrors INTERACT_DISTANCE in the frontend config
export const MIN_HUDDLE_SIZE = 3; // two people keep using the persisted one-on-one DM
export const MAX_HUDDLE_HISTORY = 100; // messages kept for people who walk up late

export interface HuddleMessage {
  fromId: number;
  fromName: string;
  body: string;
  createdAt: number;
}

export interface Huddle {
  id: number;
  members: Set<number>;
  messages: HuddleMessage[];
}

export interface HuddleChange {
  playerId: number;
  huddle: Huddle | null;
}

const withinRange = (a: Position, b: Position) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= HUDDLE_DISTANCE;

/**
 * Groups players into huddles. `players` is any iterable of
 * `[id, { x, y }]` entries; returns an array of member-id arrays, one per
 * huddle, smallest id first. Groups below MIN_HUDDLE_SIZE are dropped.
 */
export function computeHuddles(players: Iterable<[number, Position]>): number[][] {
  const entries = [...players];
  const unvisited = new Set(entries.map(([id]) => id));
  const positions = new Map(entries);
  const huddles: number[][] = [];

  for (const [id] of entries) {
    if (!unvisited.has(id)) continue;

    // Flood fill outward from this player through everyone in earshot
    const component: number[] = [];
    const queue = [id];
    unvisited.delete(id);
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      for (const other of [...unvisited]) {
        if (withinRange(positions.get(current)!, positions.get(other)!)) {
          unvisited.delete(other);
          queue.push(other);
        }
      }
    }

    if (component.length >= MIN_HUDDLE_SIZE) huddles.push(component.sort((a, b) => a - b));
  }

  return huddles;
}

const signatureOf = (members: Iterable<number>) =>
  [...members].sort((a, b) => a - b).join(",");

/**
 * Tracks live huddles and their message backlogs across recomputes.
 *
 * Ids are stable: when the world is re-synced, each new group inherits the
 * id of whichever old huddle it shares the most members with, so a person
 * joining or leaving doesn't wipe the conversation everyone else is having.
 */
export class HuddleStore {
  private readonly huddles = new Map<number, Huddle>();
  private readonly assignment = new Map<number, { huddleId: number; signature: string }>();
  private nextId = 1;

  huddleFor(playerId: number): Huddle | null {
    const current = this.assignment.get(playerId);
    return current ? this.huddles.get(current.huddleId) ?? null : null;
  }

  /**
   * Recomputes every huddle from the current player positions.
   * Returns only the players whose situation actually changed, as
   * `{ playerId, huddle }` pairs — `huddle` is null for anyone who just
   * dropped out of one. An unchanged world returns an empty array.
   */
  sync(players: Iterable<[number, Position]>): HuddleChange[] {
    const components = computeHuddles(players);
    const claimed = new Set<number>();
    const next = new Map<number, Huddle>();

    for (const members of components) {
      const prior = this.inherit(members, claimed);
      const id = prior ? prior.id : this.nextId++;
      claimed.add(id);
      next.set(id, { id, members: new Set(members), messages: prior ? prior.messages : [] });
    }

    this.huddles.clear();
    for (const [id, huddle] of next) this.huddles.set(id, huddle);

    // Diff against the previous assignment: a player hears about their
    // huddle when they join, leave, or their group's membership shifts.
    const changes: HuddleChange[] = [];
    const stillAssigned = new Set<number>();
    for (const huddle of this.huddles.values()) {
      const signature = signatureOf(huddle.members);
      for (const playerId of huddle.members) {
        stillAssigned.add(playerId);
        const previous = this.assignment.get(playerId);
        if (previous?.huddleId === huddle.id && previous.signature === signature) continue;
        this.assignment.set(playerId, { huddleId: huddle.id, signature });
        changes.push({ playerId, huddle });
      }
    }
    for (const playerId of [...this.assignment.keys()]) {
      if (stillAssigned.has(playerId)) continue;
      this.assignment.delete(playerId);
      changes.push({ playerId, huddle: null });
    }

    return changes;
  }

  /**
   * Appends a message to the sender's huddle. Returns the huddle it
   * landed in, or null if the sender isn't in one (they walked off
   * between typing and hitting send).
   */
  addMessage(playerId: number, message: HuddleMessage): Huddle | null {
    const current = this.assignment.get(playerId);
    const huddle = current ? this.huddles.get(current.huddleId) : null;
    if (!huddle) return null;
    huddle.messages.push(message);
    if (huddle.messages.length > MAX_HUDDLE_HISTORY) huddle.messages.shift();
    return huddle;
  }

  /** The surviving huddle with the largest overlap, if any */
  private inherit(members: number[], claimed: Set<number>): Huddle | null {
    let best: Huddle | null = null;
    let bestOverlap = 0;
    for (const huddle of this.huddles.values()) {
      if (claimed.has(huddle.id)) continue;
      const overlap = members.filter((id) => huddle.members.has(id)).length;
      if (overlap > bestOverlap) {
        best = huddle;
        bestOverlap = overlap;
      }
    }
    return best;
  }
}
