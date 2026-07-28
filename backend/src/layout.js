// Rules for a valid floor plan. Kept pure and separate from transport so
// the same checks cover a desk being created, dragged or reseated.
//
// The room is not fixed: pushing a desk towards a wall moves that wall
// outward. Walls only ever move out — the floor never lurches inward
// while you rearrange — until the layout is reset.

const WALL_INSET = 2; // clear floor kept between a desk and a wall centreline
const BRICK = 2; // walls are laid in 2-unit bricks, so bounds snap to them
const MAX_ROOM = { minX: -80, maxX: 80, minY: -60, maxY: 60 };
const MIN_ROOM_SPAN = 12; // small enough to be cosy, big enough to walk in
const MIN_GAP = 2; // desks are 2 units wide; closer than this and they overlap
const MAX_ID_LENGTH = 20;
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

const fail = (error) => ({ ok: false, error });
const ok = (value) => ({ ok: true, value });

const outward = (n) => Math.ceil(n / BRICK) * BRICK;
const inward = (n) => Math.floor(n / BRICK) * BRICK;

/**
 * The room needed to hold a desk at (x, y): the current one, widened on
 * any side the desk has pushed past. Returns the same object shape, and
 * an unchanged room if the desk already fits.
 */
function growRoom(room, x, y) {
  return {
    minX: Math.min(room.minX, inward(x - WALL_INSET)),
    maxX: Math.max(room.maxX, outward(x + WALL_INSET)),
    minY: Math.min(room.minY, inward(y - WALL_INSET)),
    maxY: Math.max(room.maxY, outward(y + WALL_INSET)),
  };
}

const sameRoom = (a, b) =>
  a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;

const fitsInMaxRoom = (room) =>
  room.minX >= MAX_ROOM.minX &&
  room.maxX <= MAX_ROOM.maxX &&
  room.minY >= MAX_ROOM.minY &&
  room.maxY <= MAX_ROOM.maxY;

function validPosition(x, y, room) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "Desk needs a numeric position";
  if (!fitsInMaxRoom(growRoom(room, x, y))) return "The office can't grow any further that way";
  return null;
}

function overlaps(x, y, desks, ignoreId) {
  return desks.some(
    (d) => d.id !== ignoreId && Math.abs(d.x - x) < MIN_GAP && Math.abs(d.y - y) < MIN_GAP
  );
}

/**
 * Checks a new desk. Returns the desk plus the room it needs, which the
 * caller should persist when it differs from the current one.
 */
function validateNewDesk({ id, x, y }, desks, room) {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) return fail("Desk needs a code");
  if (trimmed.length > MAX_ID_LENGTH) return fail(`Keep the code under ${MAX_ID_LENGTH} characters`);
  if (!VALID_ID.test(trimmed)) return fail("Use letters, numbers, spaces, dashes or underscores");
  if (desks.some((d) => d.id.toLowerCase() === trimmed.toLowerCase())) {
    return fail(`${trimmed} already exists`);
  }

  const positionError = validPosition(x, y, room);
  if (positionError) return fail(positionError);
  if (overlaps(x, y, desks, null)) return fail("Another desk is already there");

  return ok({ id: trimmed, x, y, room: growRoom(room, x, y) });
}

/** Checks a drag. The desk being moved is excluded from the overlap test. */
function validateMove({ id, x, y }, desks, room) {
  if (!desks.some((d) => d.id === id)) return fail("That desk is gone");

  const positionError = validPosition(x, y, room);
  if (positionError) return fail(positionError);
  if (overlaps(x, y, desks, id)) return fail("Another desk is already there");

  return ok({ id, x, y, room: growRoom(room, x, y) });
}

/**
 * Checks a room the editor asked for directly. Unlike dragging a desk,
 * this can shrink the office — so the walls must still clear every desk
 * and leave a usable floor.
 */
function validateRoom(room, desks) {
  const numbers = [room?.minX, room?.maxX, room?.minY, room?.maxY];
  if (!numbers.every((n) => Number.isFinite(n))) return fail("The room needs numeric walls");

  const tidy = {
    minX: inward(room.minX),
    maxX: outward(room.maxX),
    minY: inward(room.minY),
    maxY: outward(room.maxY),
  };

  if (tidy.maxX - tidy.minX < MIN_ROOM_SPAN || tidy.maxY - tidy.minY < MIN_ROOM_SPAN) {
    return fail(`The office can't be smaller than ${MIN_ROOM_SPAN} units across`);
  }
  if (!fitsInMaxRoom(tidy)) return fail("The office can't grow any further that way");

  const trapped = desks.find(
    (d) =>
      d.x - WALL_INSET < tidy.minX ||
      d.x + WALL_INSET > tidy.maxX ||
      d.y - WALL_INSET < tidy.minY ||
      d.y + WALL_INSET > tidy.maxY
  );
  if (trapped) return fail(`${trapped.id} would end up in the wall`);

  return ok(tidy);
}

/**
 * Checks moving a person from one desk to another. Dropping someone onto
 * an occupied desk trades the two places rather than failing, so
 * rearranging a seating chart never needs a free desk to shuffle through.
 */
function validateReseat({ fromDeskId, toDeskId }, desks, isOccupied) {
  if (fromDeskId === toDeskId) return fail("They already sit there");
  if (!desks.some((d) => d.id === fromDeskId)) return fail("That desk is gone");
  if (!desks.some((d) => d.id === toDeskId)) return fail("That desk is gone");
  if (!isOccupied(fromDeskId)) return fail("Nobody sits there");

  return ok({ fromDeskId, toDeskId, swap: isOccupied(toDeskId) });
}

module.exports = {
  validateNewDesk,
  validateMove,
  validateReseat,
  validateRoom,
  growRoom,
  sameRoom,
  WALL_INSET,
  MAX_ROOM,
  MIN_ROOM_SPAN,
  MIN_GAP,
};
