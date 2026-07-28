const test = require("node:test");
const assert = require("node:assert");
const { validateNewDesk, validateMove, validateReseat, BOUNDS } = require("./layout");

const DESKS = [
  { id: "TB-046", x: -17.5, y: 8 },
  { id: "TB-110", x: 4, y: 8 },
];

test("accepts a desk on open floor", () => {
  const result = validateNewDesk({ id: " TB-200 ", x: 0, y: 0 }, DESKS);
  assert.deepStrictEqual(result, { ok: true, value: { id: "TB-200", x: 0, y: 0 } });
});

test("rejects a blank or malformed code", () => {
  assert.strictEqual(validateNewDesk({ id: "   ", x: 0, y: 0 }, DESKS).error, "Desk needs a code");
  assert.match(validateNewDesk({ id: "TB/200", x: 0, y: 0 }, DESKS).error, /letters, numbers/);
  assert.match(validateNewDesk({ id: "x".repeat(21), x: 0, y: 0 }, DESKS).error, /under 20/);
});

test("rejects a duplicate code regardless of case", () => {
  assert.strictEqual(validateNewDesk({ id: "tb-110", x: 0, y: 0 }, DESKS).error, "tb-110 already exists");
});

test("rejects a spot outside the office", () => {
  const error = "That spot is outside the office";
  assert.strictEqual(validateNewDesk({ id: "A", x: BOUNDS.maxX + 1, y: 0 }, DESKS).error, error);
  assert.strictEqual(validateNewDesk({ id: "A", x: 0, y: BOUNDS.minY - 1 }, DESKS).error, error);
});

test("rejects a non-numeric position", () => {
  assert.match(validateNewDesk({ id: "A", x: NaN, y: 0 }, DESKS).error, /numeric position/);
});

test("rejects overlapping an existing desk but allows sitting flush beside it", () => {
  assert.strictEqual(validateNewDesk({ id: "A", x: 5, y: 8 }, DESKS).error, "Another desk is already there");
  assert.strictEqual(validateNewDesk({ id: "A", x: 6, y: 8 }, DESKS).ok, true);
});

test("a move ignores the desk's own current position", () => {
  // Nudging TB-110 slightly must not collide with where TB-110 already is
  assert.strictEqual(validateMove({ id: "TB-110", x: 4.5, y: 8 }, DESKS).ok, true);
  assert.strictEqual(validateMove({ id: "TB-110", x: -17, y: 8 }, DESKS).error, "Another desk is already there");
});

test("a move of a vanished desk is refused", () => {
  assert.strictEqual(validateMove({ id: "GONE", x: 0, y: 0 }, DESKS).error, "That desk is gone");
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
