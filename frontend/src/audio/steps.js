import { sfx } from "./sfx";

const STEP_DISTANCE = 0.85; // world units between footfalls
const EARSHOT = 9; // beyond this, somebody else's steps aren't heard
const TELEPORT = 3; // a jump this big in one frame isn't walking

/**
 * Turns movement into footsteps — yours, and anyone walking near you.
 *
 * Steps are counted by distance travelled rather than by a timer, so they
 * keep pace with the walk instead of drifting against it, and each person
 * starts mid-stride so a crowd doesn't march in lockstep.
 */
export function createStepTracker() {
  const walked = new Map(); // player id -> distance since their last step
  const seen = new Map(); // player id -> where they were last frame

  return {
    update(world) {
      if (world.myId === null) return;
      const players = world.playerList();
      const present = new Set();

      for (const player of players) {
        present.add(player.id);
        const previous = seen.get(player.id);
        seen.set(player.id, { x: player.x, y: player.y });
        if (!previous) continue;

        const moved = Math.hypot(player.x - previous.x, player.y - previous.y);
        // Standing still, or snapped somewhere by the server
        if (moved < 0.0005 || moved > TELEPORT) continue;

        // First step of a walk lands at a random point in the stride, so
        // two people crossing the room don't fall into step with each other
        const total = (walked.get(player.id) ?? Math.random() * STEP_DISTANCE) + moved;
        if (total < STEP_DISTANCE) {
          walked.set(player.id, total);
          continue;
        }
        walked.set(player.id, total - STEP_DISTANCE);

        const dx = player.x - world.myPos.x;
        const distance = player.id === world.myId ? 0 : Math.hypot(dx, player.y - world.myPos.y);
        if (distance > EARSHOT) continue;
        sfx.step({ distance, pan: distance ? dx / EARSHOT : 0 });
      }

      // Whoever left took their half-stride with them
      for (const id of [...seen.keys()]) {
        if (present.has(id)) continue;
        seen.delete(id);
        walked.delete(id);
      }
    },
  };
}
