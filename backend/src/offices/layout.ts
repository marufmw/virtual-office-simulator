// Rules for a valid floor plan. Kept pure and separate from transport so
// the same checks cover a desk being created, dragged or reseated.
//
// The room is not fixed: pushing a desk towards a wall moves that wall
// outward. Walls only ever move out — the floor never lurches inward
// while you rearrange — until the layout is reset.

export interface Room {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface DeskPosition {
  id: string;
  x: number;
  y: number;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const WALL_INSET = 2; // clear floor kept between a desk and a wall centreline
const BRICK = 2; // walls are laid in 2-unit bricks, so bounds snap to them
export const MAX_ROOM: Room = { minX: -80, maxX: 80, minY: -60, maxY: 60 };
export const MIN_ROOM_SPAN = 12; // small enough to be cosy, big enough to walk in
export const MIN_GAP = 2; // desks are 2 units wide; closer than this and they overlap
const MAX_ID_LENGTH = 20;
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

const fail = (error: string): Checked<never> => ({ ok: false, error });
const ok = <T>(value: T): Checked<T> => ({ ok: true, value });

const outward = (n: number) => Math.ceil(n / BRICK) * BRICK;
const inward = (n: number) => Math.floor(n / BRICK) * BRICK;

/**
 * The room needed to hold a desk at (x, y): the current one, widened on
 * any side the desk has pushed past. Returns the same object shape, and
 * an unchanged room if the desk already fits.
 */
export function growRoom(room: Room, x: number, y: number): Room {
  return {
    minX: Math.min(room.minX, inward(x - WALL_INSET)),
    maxX: Math.max(room.maxX, outward(x + WALL_INSET)),
    minY: Math.min(room.minY, inward(y - WALL_INSET)),
    maxY: Math.max(room.maxY, outward(y + WALL_INSET)),
  };
}

export const sameRoom = (a: Room, b: Room) =>
  a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;

const fitsInMaxRoom = (room: Room) =>
  room.minX >= MAX_ROOM.minX &&
  room.maxX <= MAX_ROOM.maxX &&
  room.minY >= MAX_ROOM.minY &&
  room.maxY <= MAX_ROOM.maxY;

function validPosition(x: number, y: number, room: Room): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "Desk needs a numeric position";
  if (!fitsInMaxRoom(growRoom(room, x, y))) return "The office can't grow any further that way";
  return null;
}

function overlaps(x: number, y: number, desks: DeskPosition[], ignoreId: string | null) {
  return desks.some(
    (d) => d.id !== ignoreId && Math.abs(d.x - x) < MIN_GAP && Math.abs(d.y - y) < MIN_GAP
  );
}

export interface PlacedDesk extends DeskPosition {
  room: Room;
}

/**
 * Checks the code written on a desk — for a new one, and for one being
 * renamed. `ignoreId` is the desk keeping its own code.
 */
export function validateCode(
  code: unknown,
  desks: DeskPosition[],
  ignoreId: string | null = null
): Checked<string> {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!trimmed) return fail("Desk needs a code");
  if (trimmed.length > MAX_ID_LENGTH) return fail(`Keep the code under ${MAX_ID_LENGTH} characters`);
  if (!VALID_ID.test(trimmed)) return fail("Use letters, numbers, spaces, dashes or underscores");
  if (
    desks.some((d) => d.id !== ignoreId && d.id.toLowerCase() === trimmed.toLowerCase())
  ) {
    return fail(`${trimmed} already exists`);
  }
  return ok(trimmed);
}

/**
 * Checks a new desk. Returns the desk plus the room it needs, which the
 * caller should persist when it differs from the current one.
 */
export function validateNewDesk(
  { id, x, y }: { id?: unknown; x?: unknown; y?: unknown },
  desks: DeskPosition[],
  room: Room
): Checked<PlacedDesk> {
  const code = validateCode(id, desks);
  if (!code.ok) return code;
  const trimmed = code.value;

  const positionError = validPosition(x as number, y as number, room);
  if (positionError) return fail(positionError);
  if (overlaps(x as number, y as number, desks, null)) return fail("Another desk is already there");

  return ok({
    id: trimmed,
    x: x as number,
    y: y as number,
    room: growRoom(room, x as number, y as number),
  });
}

/** Checks a drag. The desk being moved is excluded from the overlap test. */
export function validateMove(
  { id, x, y }: { id: string; x?: unknown; y?: unknown },
  desks: DeskPosition[],
  room: Room
): Checked<PlacedDesk> {
  if (!desks.some((d) => d.id === id)) return fail("That desk is gone");

  const positionError = validPosition(x as number, y as number, room);
  if (positionError) return fail(positionError);
  if (overlaps(x as number, y as number, desks, id)) return fail("Another desk is already there");

  return ok({
    id,
    x: x as number,
    y: y as number,
    room: growRoom(room, x as number, y as number),
  });
}

/**
 * Checks a room the editor asked for directly. Unlike dragging a desk,
 * this can shrink the office — so the walls must still clear every desk
 * and leave a usable floor.
 */
export function validateRoom(room: Partial<Room> | null | undefined, desks: DeskPosition[]): Checked<Room> {
  const numbers = [room?.minX, room?.maxX, room?.minY, room?.maxY];
  if (!numbers.every((n) => Number.isFinite(n))) return fail("The room needs numeric walls");

  const tidy: Room = {
    minX: inward(room!.minX!),
    maxX: outward(room!.maxX!),
    minY: inward(room!.minY!),
    maxY: outward(room!.maxY!),
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

export interface Reseat {
  fromDeskId: string;
  toDeskId: string;
  swap: boolean;
}

/**
 * Checks moving a person from one desk to another. Dropping someone onto
 * an occupied desk trades the two places rather than failing, so
 * rearranging a seating chart never needs a free desk to shuffle through.
 */
export function validateReseat(
  { fromDeskId, toDeskId }: { fromDeskId?: unknown; toDeskId?: unknown },
  desks: DeskPosition[],
  isOccupied: (deskId: string) => boolean
): Checked<Reseat> {
  if (fromDeskId === toDeskId) return fail("They already sit there");
  if (!desks.some((d) => d.id === fromDeskId)) return fail("That desk is gone");
  if (!desks.some((d) => d.id === toDeskId)) return fail("That desk is gone");
  if (!isOccupied(fromDeskId as string)) return fail("Nobody sits there");

  return ok({
    fromDeskId: fromDeskId as string,
    toDeskId: toDeskId as string,
    swap: isOccupied(toDeskId as string),
  });
}
