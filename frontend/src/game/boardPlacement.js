/**
 * Where the whiteboard is, in world units.
 *
 * Nothing here is stored: the board hangs in the middle of the back wall,
 * so its position falls out of the room's own bounds and follows them when
 * the office is resized. The backend works the same spot out the same way
 * in boards.js — BOARD_INSET has to match at both ends, or you would be
 * standing somewhere the server doesn't think counts as "at the board".
 *
 * Kept free of Three.js so the plan views can draw the board without
 * pulling the 3D world in with it.
 */

export const BOARD_INSET = 2; // how far in front of the wall you stand
export const BOARD_WIDTH = 5; // how wide the board is
export const BOARD_ASPECT = 100 / 160; // its texture's height over its width

/** Where the board hangs: on the wall itself. */
export const boardPosition = (room) => ({
  x: (room.minX + room.maxX) / 2,
  y: room.maxY,
});

/** And the floor in front of it, which is where you have to be to draw. */
export const boardStandPosition = (room) => ({
  x: (room.minX + room.maxX) / 2,
  y: room.maxY - BOARD_INSET,
});
