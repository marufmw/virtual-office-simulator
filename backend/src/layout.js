// Rules for a valid floor plan. Kept pure and separate from transport so
// the same checks cover a desk being created, dragged or reseated.

// Walkable floor, inset from the wall centrelines in createWorld
const BOUNDS = { minX: -20, maxX: 20, minY: -13, maxY: 16 };
const MIN_GAP = 2; // desks are 2 units wide; closer than this and they overlap
const MAX_ID_LENGTH = 20;
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

const fail = (error) => ({ ok: false, error });
const ok = (value) => ({ ok: true, value });

function validPosition(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "Desk needs a numeric position";
  if (x < BOUNDS.minX || x > BOUNDS.maxX || y < BOUNDS.minY || y > BOUNDS.maxY) {
    return "That spot is outside the office";
  }
  return null;
}

function overlaps(x, y, desks, ignoreId) {
  return desks.some(
    (d) => d.id !== ignoreId && Math.abs(d.x - x) < MIN_GAP && Math.abs(d.y - y) < MIN_GAP
  );
}

/** Checks a new desk. `desks` is the current floor plan. */
function validateNewDesk({ id, x, y }, desks) {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) return fail("Desk needs a code");
  if (trimmed.length > MAX_ID_LENGTH) return fail(`Keep the code under ${MAX_ID_LENGTH} characters`);
  if (!VALID_ID.test(trimmed)) return fail("Use letters, numbers, spaces, dashes or underscores");
  if (desks.some((d) => d.id.toLowerCase() === trimmed.toLowerCase())) {
    return fail(`${trimmed} already exists`);
  }

  const positionError = validPosition(x, y);
  if (positionError) return fail(positionError);
  if (overlaps(x, y, desks, null)) return fail("Another desk is already there");

  return ok({ id: trimmed, x, y });
}

/** Checks a drag. The desk being moved is excluded from the overlap test. */
function validateMove({ id, x, y }, desks) {
  if (!desks.some((d) => d.id === id)) return fail("That desk is gone");

  const positionError = validPosition(x, y);
  if (positionError) return fail(positionError);
  if (overlaps(x, y, desks, id)) return fail("Another desk is already there");

  return ok({ id, x, y });
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

module.exports = { validateNewDesk, validateMove, validateReseat, BOUNDS, MIN_GAP };
