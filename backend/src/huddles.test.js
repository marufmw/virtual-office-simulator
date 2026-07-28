const test = require("node:test");
const assert = require("node:assert");
const { computeHuddles, createHuddleStore, MAX_HUDDLE_HISTORY } = require("./huddles");

const at = (...entries) => entries.map(([id, x, y]) => [id, { x, y }]);

test("a chain forms one huddle even when the ends are out of range", () => {
  // A--B--C: 2 units apart each, so A and C are 4 apart (beyond 2.5)
  const huddles = computeHuddles(at([1, 0, 0], [2, 2, 0], [3, 4, 0]));
  assert.deepStrictEqual(huddles, [[1, 2, 3]]);
});

test("two people are not a huddle", () => {
  assert.deepStrictEqual(computeHuddles(at([1, 0, 0], [2, 1, 0])), []);
});

test("separate pairs stay separate and form nothing", () => {
  const huddles = computeHuddles(at([1, 0, 0], [2, 1, 0], [3, 30, 0], [4, 31, 0]));
  assert.deepStrictEqual(huddles, []);
});

test("two distant groups of three form two huddles", () => {
  const huddles = computeHuddles(
    at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 30, 0], [5, 31, 0], [6, 32, 0])
  );
  assert.deepStrictEqual(huddles, [
    [1, 2, 3],
    [4, 5, 6],
  ]);
});

test("someone standing alone is in no huddle", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0]));
  assert.strictEqual(store.huddleFor(4), null);
});

test("an idle world produces no repeat notifications", () => {
  const store = createHuddleStore();
  const world = at([1, 0, 0], [2, 1, 0], [3, 2, 0]);
  assert.strictEqual(store.sync(world).length, 3);
  assert.deepStrictEqual(store.sync(world), []);
});

test("a huddle keeps its id and backlog when a member walks out", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0]));
  const original = store.huddleFor(1).id;
  store.addMessage(1, { body: "hello" });

  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0]));

  assert.strictEqual(store.huddleFor(1).id, original);
  assert.deepStrictEqual(store.huddleFor(1).messages, [{ body: "hello" }]);
  assert.strictEqual(store.huddleFor(4), null);
});

test("a split huddle keeps its id on the larger remnant", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0], [5, 4, 0], [6, 5, 0]));
  const original = store.huddleFor(1).id;

  // 4,5,6 wander off together, still close enough to each other to huddle
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0], [5, 41, 0], [6, 42, 0]));

  assert.strictEqual(store.huddleFor(1).id, original);
  assert.notStrictEqual(store.huddleFor(4).id, original);
});

test("dissolving below three people drops the conversation", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
  store.addMessage(1, { body: "hello" });

  const changes = store.sync(at([1, 0, 0], [2, 1, 0], [3, 40, 0]));

  assert.deepStrictEqual(
    changes.map((c) => [c.playerId, c.huddle]).sort(),
    [
      [1, null],
      [2, null],
      [3, null],
    ].sort()
  );
  assert.strictEqual(store.huddleFor(1), null);

  // Regrouping starts a fresh conversation, not the old one
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
  assert.deepStrictEqual(store.huddleFor(1).messages, []);
});

test("a newcomer is told about the huddle they walked into", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
  store.addMessage(1, { body: "hello" });

  const changes = store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0]));

  // Everyone hears about it — the membership changed for all of them
  assert.deepStrictEqual(changes.map((c) => c.playerId).sort(), [1, 2, 3, 4]);
  assert.deepStrictEqual(store.huddleFor(4).messages, [{ body: "hello" }]);
});

test("messages from someone outside a huddle are rejected", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0]));
  assert.strictEqual(store.addMessage(4, { body: "anyone?" }), null);
});

test("the backlog is capped", () => {
  const store = createHuddleStore();
  store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
  for (let n = 0; n < MAX_HUDDLE_HISTORY + 10; n++) store.addMessage(1, { body: `m${n}` });

  const { messages } = store.huddleFor(1);
  assert.strictEqual(messages.length, MAX_HUDDLE_HISTORY);
  assert.strictEqual(messages[messages.length - 1].body, `m${MAX_HUDDLE_HISTORY + 9}`);
  assert.strictEqual(messages[0].body, "m10");
});
