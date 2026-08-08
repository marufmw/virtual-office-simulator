/**
 * The room's wall centrelines. The server owns the real value; this
 * mirrors its growth rule (see WALL_INSET and growRoom in the backend's
 * layout.js) so the floor plan can show a wall moving out while a desk is
 * still being dragged, before the server has confirmed anything.
 */
// What a new office opens with, mirrored by DEFAULT_ROOM in the backend's
// office.constants.ts. Only ever seen for the moment before the real walls
// arrive from the server.
export const DEFAULT_ROOM = { minX: -12, maxX: 12, minY: -10, maxY: 10 };
export const MAX_ROOM = { minX: -80, maxX: 80, minY: -60, maxY: 60 };

const WALL_INSET = 2; // clear floor kept between a desk and a wall
const BRICK = 2; // walls are laid in 2-unit bricks, so bounds snap to them

const outward = (n) => Math.ceil(n / BRICK) * BRICK;
const inward = (n) => Math.floor(n / BRICK) * BRICK;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

/** The room needed to hold a desk at (x, y). Walls only move outward. */
export function growRoom(room, x, y) {
  return {
    minX: Math.max(MAX_ROOM.minX, Math.min(room.minX, inward(x - WALL_INSET))),
    maxX: Math.min(MAX_ROOM.maxX, Math.max(room.maxX, outward(x + WALL_INSET))),
    minY: Math.max(MAX_ROOM.minY, Math.min(room.minY, inward(y - WALL_INSET))),
    maxY: Math.min(MAX_ROOM.maxY, Math.max(room.maxY, outward(y + WALL_INSET))),
  };
}

/** How far a desk may be dragged before the room would refuse to grow. */
export const clampToMaxRoom = (x, y) => ({
  x: clamp(x, MAX_ROOM.minX + WALL_INSET, MAX_ROOM.maxX - WALL_INSET),
  y: clamp(y, MAX_ROOM.minY + WALL_INSET, MAX_ROOM.maxY - WALL_INSET),
});
