const test = require("node:test");
const assert = require("node:assert");
const { validateNewDesk, validateMove, validateReseat, validateRoom, growRoom, MAX_ROOM } = require("./layout");

const DESKS = [
  { id: "TB-046", x: -17.5, y: 8 },
  { id: "TB-110", x: 4, y: 8 },
];
const ROOM = { minX: -22, maxX: 22, minY: -15, maxY: 18 };

test("accepts a desk on open floor and leaves the room alone", () => {
  const result = validateNewDesk({ id: " TB-200 ", x: 0, y: 0 }, DESKS, ROOM);
  assert.deepStrictEqual(result, { ok: true, value: { id: "TB-200", x: 0, y: 0, room: ROOM } });
});

test("rejects a blank or malformed code", () => {
  assert.strictEqual(validateNewDesk({ id: "   ", x: 0, y: 0 }, DESKS, ROOM).error, "Desk needs a code");
  assert.match(validateNewDesk({ id: "TB/200", x: 0, y: 0 }, DESKS, ROOM).error, /letters, numbers/);
  assert.match(validateNewDesk({ id: "x".repeat(21), x: 0, y: 0 }, DESKS, ROOM).error, /under 20/);
});

test("rejects a duplicate code regardless of case", () => {
  assert.strictEqual(validateNewDesk({ id: "tb-110", x: 0, y: 0 }, DESKS, ROOM).error, "tb-110 already exists");
});

test("a desk pushed past a wall grows the room instead of being refused", () => {
  const result = validateNewDesk({ id: "A", x: 25, y: 0 }, DESKS, ROOM);
  assert.strictEqual(result.ok, true);
  // 25 + 2 units of clearance, snapped out to the next brick
  assert.deepStrictEqual(result.value.room, { ...ROOM, maxX: 28 });
});

test("the room only ever grows outward", () => {
  // A desk well inside the room leaves every wall where it was
  assert.deepStrictEqual(growRoom(ROOM, 0, 0), ROOM);
  // Growing one wall doesn't pull the opposite one in
  assert.deepStrictEqual(growRoom(ROOM, -30, 0), { ...ROOM, minX: -32 });
  assert.deepStrictEqual(growRoom(ROOM, 0, 25), { ...ROOM, maxY: 28 });
  assert.deepStrictEqual(growRoom(ROOM, 0, -20), { ...ROOM, minY: -22 });
});

test("the room stops growing at its limit", () => {
  const result = validateNewDesk({ id: "A", x: MAX_ROOM.maxX + 5, y: 0 }, DESKS, ROOM);
  assert.match(result.error, /can't grow any further/);
});

test("a desk dragged outward grows the room", () => {
  const result = validateMove({ id: "TB-110", x: 4, y: 30 }, DESKS, ROOM);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.room, { ...ROOM, maxY: 32 });
});

test("rejects a non-numeric position", () => {
  assert.match(validateNewDesk({ id: "A", x: NaN, y: 0 }, DESKS, ROOM).error, /numeric position/);
});

test("rejects overlapping an existing desk but allows sitting flush beside it", () => {
  assert.strictEqual(validateNewDesk({ id: "A", x: 5, y: 8 }, DESKS, ROOM).error, "Another desk is already there");
  assert.strictEqual(validateNewDesk({ id: "A", x: 6, y: 8 }, DESKS, ROOM).ok, true);
});

test("a move ignores the desk's own current position", () => {
  // Nudging TB-110 slightly must not collide with where TB-110 already is
  assert.strictEqual(validateMove({ id: "TB-110", x: 4.5, y: 8 }, DESKS, ROOM).ok, true);
  assert.strictEqual(validateMove({ id: "TB-110", x: -17, y: 8 }, DESKS, ROOM).error, "Another desk is already there");
});

test("a move of a vanished desk is refused", () => {
  assert.strictEqual(validateMove({ id: "GONE", x: 0, y: 0 }, DESKS, ROOM).error, "That desk is gone");
});

test("a hand-resized room may shrink, unlike a desk-driven one", () => {
  const result = validateRoom({ minX: -20, maxX: 20, minY: -13, maxY: 13 }, DESKS);
  assert.deepStrictEqual(result, {
    ok: true,
    value: { minX: -20, maxX: 20, minY: -13 - 1, maxY: 14 },
  });
});

test("a wall can't be dragged through a desk", () => {
  // TB-046 sits at x = -17.5 and needs 2 units of clearance behind it
  const result = validateRoom({ minX: -16, maxX: 22, minY: -15, maxY: 18 }, DESKS);
  assert.strictEqual(result.error, "TB-046 would end up in the wall");
});

test("the office has a minimum size", () => {
  const result = validateRoom({ minX: -4, maxX: 4, minY: -4, maxY: 4 }, DESKS);
  assert.match(result.error, /can't be smaller than 12/);
});

test("a hand-resized room is refused beyond the limit", () => {
  const result = validateRoom({ minX: -200, maxX: 200, minY: -15, maxY: 18 }, DESKS);
  assert.match(result.error, /can't grow any further/);
});

test("reseating needs someone to actually move", () => {
  const occupied = (id) => id === "TB-110";
  assert.deepStrictEqual(validateReseat({ fromDeskId: "TB-110", toDeskId: "TB-046" }, DESKS, occupied), {
    ok: true,
    value: { fromDeskId: "TB-110", toDeskId: "TB-046", swap: false },
  });
  assert.strictEqual(
    validateReseat({ fromDeskId: "TB-046", toDeskId: "TB-110" }, DESKS, occupied).error,
    "Nobody sits there"
  );
  assert.strictEqual(
    validateReseat({ fromDeskId: "TB-110", toDeskId: "TB-110" }, DESKS, occupied).error,
    "They already sit there"
  );
  assert.strictEqual(
    validateReseat({ fromDeskId: "TB-110", toDeskId: "NOPE" }, DESKS, occupied).error,
    "That desk is gone"
  );
});

test("reseating onto a taken desk is a swap, not a refusal", () => {
  const occupied = () => true;
  assert.deepStrictEqual(validateReseat({ fromDeskId: "TB-110", toDeskId: "TB-046" }, DESKS, occupied), {
    ok: true,
    value: { fromDeskId: "TB-110", toDeskId: "TB-046", swap: true },
  });
});
