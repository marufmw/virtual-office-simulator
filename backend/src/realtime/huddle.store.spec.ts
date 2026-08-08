import { Position } from "./board.store";
import { HuddleMessage, HuddleStore, MAX_HUDDLE_HISTORY, computeHuddles } from "./huddle.store";

const at = (...entries: Array<[number, number, number]>): Array<[number, Position]> =>
  entries.map(([id, x, y]) => [id, { x, y }]);

// Only the body matters to these tests; the rest of a message is the
// gateway's business
const said = (body: string) => ({ body }) as HuddleMessage;

describe("grouping", () => {
  it("forms one huddle from a chain even when the ends are out of range", () => {
    // A--B--C: 2 units apart each, so A and C are 4 apart (beyond 2.5)
    expect(computeHuddles(at([1, 0, 0], [2, 2, 0], [3, 4, 0]))).toEqual([[1, 2, 3]]);
  });

  it("does not call two people a huddle", () => {
    expect(computeHuddles(at([1, 0, 0], [2, 1, 0]))).toEqual([]);
  });

  it("keeps separate pairs separate, forming nothing", () => {
    expect(computeHuddles(at([1, 0, 0], [2, 1, 0], [3, 30, 0], [4, 31, 0]))).toEqual([]);
  });

  it("forms two huddles from two distant groups of three", () => {
    expect(
      computeHuddles(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 30, 0], [5, 31, 0], [6, 32, 0]))
    ).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });
});

describe("the store", () => {
  it("puts someone standing alone in no huddle", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0]));
    expect(store.huddleFor(4)).toBeNull();
  });

  it("produces no repeat notifications for an idle world", () => {
    const store = new HuddleStore();
    const world = at([1, 0, 0], [2, 1, 0], [3, 2, 0]);
    expect(store.sync(world)).toHaveLength(3);
    expect(store.sync(world)).toEqual([]);
  });

  it("keeps a huddle's id and backlog when a member walks out", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0]));
    const original = store.huddleFor(1)!.id;
    store.addMessage(1, said("hello"));

    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0]));

    expect(store.huddleFor(1)!.id).toBe(original);
    expect(store.huddleFor(1)!.messages).toEqual([{ body: "hello" }]);
    expect(store.huddleFor(4)).toBeNull();
  });

  it("keeps a split huddle's id on the larger remnant", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0], [5, 4, 0], [6, 5, 0]));
    const original = store.huddleFor(1)!.id;

    // 4,5,6 wander off together, still close enough to each other to huddle
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0], [5, 41, 0], [6, 42, 0]));

    expect(store.huddleFor(1)!.id).toBe(original);
    expect(store.huddleFor(4)!.id).not.toBe(original);
  });

  it("drops the conversation when a huddle dissolves below three people", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
    store.addMessage(1, said("hello"));

    const changes = store.sync(at([1, 0, 0], [2, 1, 0], [3, 40, 0]));

    expect(changes.map((c) => [c.playerId, c.huddle]).sort()).toEqual(
      [
        [1, null],
        [2, null],
        [3, null],
      ].sort()
    );
    expect(store.huddleFor(1)).toBeNull();

    // Regrouping starts a fresh conversation, not the old one
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
    expect(store.huddleFor(1)!.messages).toEqual([]);
  });

  it("tells a newcomer about the huddle they walked into", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
    store.addMessage(1, said("hello"));

    const changes = store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 3, 0]));

    // Everyone hears about it — the membership changed for all of them
    expect(changes.map((c) => c.playerId).sort()).toEqual([1, 2, 3, 4]);
    expect(store.huddleFor(4)!.messages).toEqual([{ body: "hello" }]);
  });

  it("rejects messages from someone outside a huddle", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 40, 0]));
    expect(store.addMessage(4, said("anyone?"))).toBeNull();
  });

  it("caps the backlog", () => {
    const store = new HuddleStore();
    store.sync(at([1, 0, 0], [2, 1, 0], [3, 2, 0]));
    for (let n = 0; n < MAX_HUDDLE_HISTORY + 10; n++) store.addMessage(1, said(`m${n}`));

    const { messages } = store.huddleFor(1)!;
    expect(messages).toHaveLength(MAX_HUDDLE_HISTORY);
    expect(messages[messages.length - 1].body).toBe(`m${MAX_HUDDLE_HISTORY + 9}`);
    expect(messages[0].body).toBe("m10");
  });
});
