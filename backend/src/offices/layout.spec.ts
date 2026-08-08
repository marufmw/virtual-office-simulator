import {
  DeskPosition,
  MAX_ROOM,
  Room,
  growRoom,
  validateMove,
  validateNewDesk,
  validateReseat,
  validateRoom,
} from "./layout";

const DESKS: DeskPosition[] = [
  { id: "TB-046", x: -17.5, y: 8 },
  { id: "TB-110", x: 4, y: 8 },
];
const ROOM: Room = { minX: -22, maxX: 22, minY: -15, maxY: 18 };

// The failure branch is what these mostly assert on; a small reader keeps
// the narrowing out of every line
const errorOf = (result: { ok: boolean; error?: string }) => (result as { error: string }).error;
const valueOf = <T>(result: { ok: boolean; value?: T }) => (result as { value: T }).value;

describe("desks", () => {
  it("accepts a desk on open floor and leaves the room alone", () => {
    const result = validateNewDesk({ id: " TB-200 ", x: 0, y: 0 }, DESKS, ROOM);
    expect(result).toEqual({ ok: true, value: { id: "TB-200", x: 0, y: 0, room: ROOM } });
  });

  it("rejects a blank or malformed code", () => {
    expect(errorOf(validateNewDesk({ id: "   ", x: 0, y: 0 }, DESKS, ROOM))).toBe(
      "Desk needs a code"
    );
    expect(errorOf(validateNewDesk({ id: "TB/200", x: 0, y: 0 }, DESKS, ROOM))).toMatch(
      /letters, numbers/
    );
    expect(errorOf(validateNewDesk({ id: "x".repeat(21), x: 0, y: 0 }, DESKS, ROOM))).toMatch(
      /under 20/
    );
  });

  it("rejects a duplicate code regardless of case", () => {
    expect(errorOf(validateNewDesk({ id: "tb-110", x: 0, y: 0 }, DESKS, ROOM))).toBe(
      "tb-110 already exists"
    );
  });

  it("grows the room instead of refusing a desk pushed past a wall", () => {
    const result = validateNewDesk({ id: "A", x: 25, y: 0 }, DESKS, ROOM);
    expect(result.ok).toBe(true);
    // 25 + 2 units of clearance, snapped out to the next brick
    expect(valueOf(result).room).toEqual({ ...ROOM, maxX: 28 });
  });

  it("only ever grows the room outward", () => {
    // A desk well inside the room leaves every wall where it was
    expect(growRoom(ROOM, 0, 0)).toEqual(ROOM);
    // Growing one wall doesn't pull the opposite one in
    expect(growRoom(ROOM, -30, 0)).toEqual({ ...ROOM, minX: -32 });
    expect(growRoom(ROOM, 0, 25)).toEqual({ ...ROOM, maxY: 28 });
    expect(growRoom(ROOM, 0, -20)).toEqual({ ...ROOM, minY: -22 });
  });

  it("stops growing the room at its limit", () => {
    const result = validateNewDesk({ id: "A", x: MAX_ROOM.maxX + 5, y: 0 }, DESKS, ROOM);
    expect(errorOf(result)).toMatch(/can't grow any further/);
  });

  it("grows the room for a desk dragged outward", () => {
    const result = validateMove({ id: "TB-110", x: 4, y: 30 }, DESKS, ROOM);
    expect(result.ok).toBe(true);
    expect(valueOf(result).room).toEqual({ ...ROOM, maxY: 32 });
  });

  it("rejects a non-numeric position", () => {
    expect(errorOf(validateNewDesk({ id: "A", x: NaN, y: 0 }, DESKS, ROOM))).toMatch(
      /numeric position/
    );
  });

  it("rejects overlapping an existing desk but allows sitting flush beside it", () => {
    expect(errorOf(validateNewDesk({ id: "A", x: 5, y: 8 }, DESKS, ROOM))).toBe(
      "Another desk is already there"
    );
    expect(validateNewDesk({ id: "A", x: 6, y: 8 }, DESKS, ROOM).ok).toBe(true);
  });

  it("ignores the desk's own current position when moving it", () => {
    // Nudging TB-110 slightly must not collide with where TB-110 already is
    expect(validateMove({ id: "TB-110", x: 4.5, y: 8 }, DESKS, ROOM).ok).toBe(true);
    expect(errorOf(validateMove({ id: "TB-110", x: -17, y: 8 }, DESKS, ROOM))).toBe(
      "Another desk is already there"
    );
  });

  it("refuses to move a vanished desk", () => {
    expect(errorOf(validateMove({ id: "GONE", x: 0, y: 0 }, DESKS, ROOM))).toBe("That desk is gone");
  });
});

describe("the room", () => {
  it("may shrink when resized by hand, unlike a desk-driven one", () => {
    const result = validateRoom({ minX: -20, maxX: 20, minY: -13, maxY: 13 }, DESKS);
    expect(result).toEqual({ ok: true, value: { minX: -20, maxX: 20, minY: -14, maxY: 14 } });
  });

  it("can't be dragged through a desk", () => {
    // TB-046 sits at x = -17.5 and needs 2 units of clearance behind it
    const result = validateRoom({ minX: -16, maxX: 22, minY: -15, maxY: 18 }, DESKS);
    expect(errorOf(result)).toBe("TB-046 would end up in the wall");
  });

  it("has a minimum size", () => {
    expect(errorOf(validateRoom({ minX: -4, maxX: 4, minY: -4, maxY: 4 }, DESKS))).toMatch(
      /can't be smaller than 12/
    );
  });

  it("is refused beyond the limit", () => {
    const result = validateRoom({ minX: -200, maxX: 200, minY: -15, maxY: 18 }, DESKS);
    expect(errorOf(result)).toMatch(/can't grow any further/);
  });
});

describe("reseating", () => {
  const occupied = (id: string) => id === "TB-110";

  it("needs someone to actually move", () => {
    expect(validateReseat({ fromDeskId: "TB-110", toDeskId: "TB-046" }, DESKS, occupied)).toEqual({
      ok: true,
      value: { fromDeskId: "TB-110", toDeskId: "TB-046", swap: false },
    });
    expect(
      errorOf(validateReseat({ fromDeskId: "TB-046", toDeskId: "TB-110" }, DESKS, occupied))
    ).toBe("Nobody sits there");
    expect(
      errorOf(validateReseat({ fromDeskId: "TB-110", toDeskId: "TB-110" }, DESKS, occupied))
    ).toBe("They already sit there");
    expect(errorOf(validateReseat({ fromDeskId: "TB-110", toDeskId: "NOPE" }, DESKS, occupied))).toBe(
      "That desk is gone"
    );
  });

  it("is a swap onto a taken desk, not a refusal", () => {
    expect(validateReseat({ fromDeskId: "TB-110", toDeskId: "TB-046" }, DESKS, () => true)).toEqual({
      ok: true,
      value: { fromDeskId: "TB-110", toDeskId: "TB-046", swap: true },
    });
  });
});
