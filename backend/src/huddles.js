// Proximity group chat. A huddle is a connected component of players who
// are standing close enough to talk: if A can hear B and B can hear C, all
// three share one conversation even when A and C are further apart.
//
// Huddles live only in memory — they exist while people stand together and
// are forgotten once the group breaks up.

const HUDDLE_DISTANCE = 2.5; // mirrors INTERACT_DISTANCE in the frontend config
const MIN_HUDDLE_SIZE = 3; // two people keep using the persisted one-on-one DM
const MAX_HUDDLE_HISTORY = 100; // messages kept for people who walk up late

const withinRange = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= HUDDLE_DISTANCE;

/**
 * Groups players into huddles. `players` is any iterable of
 * `[id, { x, y }]` entries; returns an array of member-id arrays, one per
 * huddle, smallest id first. Groups below MIN_HUDDLE_SIZE are dropped.
 */
function computeHuddles(players) {
  const entries = [...players];
  const unvisited = new Set(entries.map(([id]) => id));
  const positions = new Map(entries);
  const huddles = [];

  for (const [id] of entries) {
    if (!unvisited.has(id)) continue;

    // Flood fill outward from this player through everyone in earshot
    const component = [];
    const queue = [id];
    unvisited.delete(id);
    while (queue.length > 0) {
      const current = queue.pop();
      component.push(current);
      for (const other of [...unvisited]) {
        if (withinRange(positions.get(current), positions.get(other))) {
          unvisited.delete(other);
          queue.push(other);
        }
      }
    }

    if (component.length >= MIN_HUDDLE_SIZE) huddles.push(component.sort((a, b) => a - b));
  }

  return huddles;
}

const signatureOf = (members) => [...members].sort((a, b) => a - b).join(",");

/**
 * Tracks live huddles and their message backlogs across recomputes.
 *
 * Ids are stable: when the world is re-synced, each new group inherits the
 * id of whichever old huddle it shares the most members with, so a person
 * joining or leaving doesn't wipe the conversation everyone else is having.
 */
function createHuddleStore() {
  const huddles = new Map(); // huddleId -> { id, members: Set, messages: [] }
  const assignment = new Map(); // playerId -> { huddleId, signature }
  let nextId = 1;

  // The surviving huddle with the largest overlap, if any
  function inherit(members, claimed) {
    let best = null;
    let bestOverlap = 0;
    for (const huddle of huddles.values()) {
      if (claimed.has(huddle.id)) continue;
      const overlap = members.filter((id) => huddle.members.has(id)).length;
      if (overlap > bestOverlap) {
        best = huddle;
        bestOverlap = overlap;
      }
    }
    return best;
  }

  return {
    huddleFor: (playerId) => {
      const current = assignment.get(playerId);
      return current ? huddles.get(current.huddleId) : null;
    },

    /**
     * Recomputes every huddle from the current player positions.
     * Returns only the players whose situation actually changed, as
     * `{ playerId, huddle }` pairs — `huddle` is null for anyone who just
     * dropped out of one. An unchanged world returns an empty array.
     */
    sync(players) {
      const components = computeHuddles(players);
      const claimed = new Set();
      const next = new Map();

      for (const members of components) {
        const prior = inherit(members, claimed);
        const id = prior ? prior.id : nextId++;
        claimed.add(id);
        next.set(id, { id, members: new Set(members), messages: prior ? prior.messages : [] });
      }

      huddles.clear();
      for (const [id, huddle] of next) huddles.set(id, huddle);

      // Diff against the previous assignment: a player hears about their
      // huddle when they join, leave, or their group's membership shifts.
      const changes = [];
      const stillAssigned = new Set();
      for (const huddle of huddles.values()) {
        const signature = signatureOf(huddle.members);
        for (const playerId of huddle.members) {
          stillAssigned.add(playerId);
          const previous = assignment.get(playerId);
          if (previous?.huddleId === huddle.id && previous.signature === signature) continue;
          assignment.set(playerId, { huddleId: huddle.id, signature });
          changes.push({ playerId, huddle });
        }
      }
      for (const playerId of [...assignment.keys()]) {
        if (stillAssigned.has(playerId)) continue;
        assignment.delete(playerId);
        changes.push({ playerId, huddle: null });
      }

      return changes;
    },

    /**
     * Appends a message to the sender's huddle. Returns the huddle it
     * landed in, or null if the sender isn't in one (they walked off
     * between typing and hitting send).
     */
    addMessage(playerId, message) {
      const current = assignment.get(playerId);
      const huddle = current && huddles.get(current.huddleId);
      if (!huddle) return null;
      huddle.messages.push(message);
      if (huddle.messages.length > MAX_HUDDLE_HISTORY) huddle.messages.shift();
      return huddle;
    },
  };
}

module.exports = {
  computeHuddles,
  createHuddleStore,
  HUDDLE_DISTANCE,
  MIN_HUDDLE_SIZE,
  MAX_HUDDLE_HISTORY,
};
