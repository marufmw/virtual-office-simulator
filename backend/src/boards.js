// The office whiteboard. Where a huddle forms around whoever is standing
// together, a board session forms around a fixed spot on the wall: walk up
// to it and you're in, walk away and you're out.
//
// Unlike a huddle, what's drawn outlives the people drawing it, so the
// scene is kept here and written to the database.

const BOARD_RANGE = 4.5; // how close you stand to take part
const BOARD_INSET = 2; // how far in front of the wall the board's spot sits
const MAX_ELEMENTS = 5000; // a runaway scene is a broken one, not a busy one

/**
 * Where the board hangs: the middle of the top wall, with the standing spot
 * just inside the room. Derived from the room rather than stored, so it
 * follows the walls when the office is resized — the frontend works it out
 * the same way.
 */
function boardAnchor(room) {
  return { x: (room.minX + room.maxX) / 2, y: room.maxY - BOARD_INSET };
}

const inRange = (position, anchor) =>
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
function newer(incoming, existing) {
  if (!existing) return true;
  const a = incoming.version ?? 0;
  const b = existing.version ?? 0;
  if (a !== b) return a > b;
  return (incoming.versionNonce ?? 0) > (existing.versionNonce ?? 0);
}

function createBoardStore() {
  const elements = new Map(); // element id -> the winning version of it
  let members = new Set();
  let dirty = false;

  return {
    get members() {
      return members;
    },

    get dirty() {
      return dirty;
    },

    snapshot: () => [...elements.values()],

    /** Replaces the scene wholesale, for loading what was saved. */
    load(saved) {
      elements.clear();
      for (const element of saved ?? []) {
        if (element?.id) elements.set(element.id, element);
      }
      dirty = false;
    },

    markSaved() {
      dirty = false;
    },

    /**
     * Folds someone's edits into the scene. Returns only the elements that
     * actually won, so a client echoing back a stale copy of something
     * doesn't get rebroadcast to everyone as news.
     */
    merge(incoming) {
      const accepted = [];
      for (const element of incoming ?? []) {
        if (!element?.id) continue;
        if (!newer(element, elements.get(element.id))) continue;
        elements.set(element.id, element);
        accepted.push(element);
      }
      if (accepted.length > 0) dirty = true;

      // Something has gone wrong upstream if we ever hit this; drop the
      // oldest tombstones rather than grow without limit
      if (elements.size > MAX_ELEMENTS) {
        for (const [id, element] of elements) {
          if (elements.size <= MAX_ELEMENTS) break;
          if (element.isDeleted) elements.delete(id);
        }
      }
      return accepted;
    },

    /**
     * Recomputes who is standing at the board. Returns `{ playerId, near }`
     * for the people whose situation changed — nothing for a world where
     * everyone stayed put relative to it.
     */
    sync(players, room) {
      const anchor = boardAnchor(room);
      const next = new Set();
      for (const [id, position] of players) {
        if (inRange(position, anchor)) next.add(id);
      }

      const changes = [];
      for (const id of next) if (!members.has(id)) changes.push({ playerId: id, near: true });
      for (const id of members) if (!next.has(id)) changes.push({ playerId: id, near: false });

      members = next;
      return changes;
    },

    /** Someone disconnected: they are no longer at the board. */
    remove(playerId) {
      members.delete(playerId);
    },
  };
}

module.exports = { createBoardStore, boardAnchor, BOARD_RANGE, BOARD_INSET };
