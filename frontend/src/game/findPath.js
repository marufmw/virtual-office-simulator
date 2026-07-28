import { PATH_CELL } from "../config";

// 8-way neighbours: [dx, dy, cost]
const DIAGONAL = Math.SQRT2;
const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
];

const MAX_NODES = 20000; // safety valve so a hopeless search can't hang a frame

/**
 * A* over a virtual grid anchored on the start position, so the walker
 * always stands on a node. `isBlocked(x, y)` decides walkability, which
 * keeps this file ignorant of desks, walls and other players.
 *
 * Returns a list of world-space waypoints ending at `goal`, or null if
 * no route exists.
 */
export function findPath(start, goal, isBlocked) {
  const key = (i, j) => `${i},${j}`;
  const toWorld = (i, j) => ({ x: start.x + i * PATH_CELL, y: start.y + j * PATH_CELL });

  // Grid coordinates of the cell nearest the goal
  const goalI = Math.round((goal.x - start.x) / PATH_CELL);
  const goalJ = Math.round((goal.y - start.y) / PATH_CELL);
  const heuristic = (i, j) => Math.hypot(i - goalI, j - goalJ);

  const open = [{ i: 0, j: 0, g: 0, f: heuristic(0, 0) }];
  const cameFrom = new Map();
  const best = new Map([[key(0, 0), 0]]);

  const walkable = (i, j) => {
    const { x, y } = toWorld(i, j);
    return !isBlocked(x, y);
  };

  let expanded = 0;
  while (open.length > 0 && expanded < MAX_NODES) {
    // Small enough search space that a linear scan beats a heap here
    let bestIndex = 0;
    for (let n = 1; n < open.length; n++) {
      if (open[n].f < open[bestIndex].f) bestIndex = n;
    }
    const current = open.splice(bestIndex, 1)[0];
    expanded++;

    if (current.i === goalI && current.j === goalJ) {
      return buildPath(cameFrom, current, toWorld, goal, isBlocked);
    }

    for (const [di, dj, cost] of NEIGHBOURS) {
      const i = current.i + di;
      const j = current.j + dj;
      const isGoal = i === goalI && j === goalJ;
      // The goal cell is allowed to be "blocked" (a desk edge, someone
      // standing there); every other cell must be clear.
      if (!isGoal && !walkable(i, j)) continue;
      // Don't cut corners diagonally between two obstacles
      if (di !== 0 && dj !== 0 && (!walkable(current.i + di, current.j) ||
          !walkable(current.i, current.j + dj))) {
        continue;
      }

      const g = current.g + cost;
      const cellKey = key(i, j);
      if (best.has(cellKey) && best.get(cellKey) <= g) continue;
      best.set(cellKey, g);
      cameFrom.set(cellKey, current);
      open.push({ i, j, g, f: g + heuristic(i, j) });
    }
  }

  return null;
}

function buildPath(cameFrom, endNode, toWorld, goal, isBlocked) {
  const nodes = [];
  let node = endNode;
  while (node) {
    nodes.unshift(node);
    node = cameFrom.get(`${node.i},${node.j}`);
  }

  const points = nodes.map(({ i, j }) => toWorld(i, j));
  points[points.length - 1] = { x: goal.x, y: goal.y }; // finish on the exact spot
  return smooth(points, isBlocked);
}

/**
 * String-pulling: drop any waypoint we can see past, turning the
 * staircase A* produces into straight runs.
 */
function smooth(points, isBlocked) {
  const result = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let furthest = anchor + 1;
    for (let n = points.length - 1; n > anchor + 1; n--) {
      if (hasLineOfSight(points[anchor], points[n], isBlocked)) {
        furthest = n;
        break;
      }
    }
    result.push(points[furthest]);
    anchor = furthest;
  }
  return result;
}

function hasLineOfSight(from, to, isBlocked) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.ceil(distance / (PATH_CELL / 2));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (isBlocked(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false;
  }
  return true;
}
