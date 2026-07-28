# Proximity group chat ("huddles")

## Goal

When three or more people stand together in the office, they share one
conversation instead of a tangle of one-on-one DMs.

## Behaviour

- **Grouping.** A huddle is a *connected component* over the "within 2.5
  world units" relation: if A is near B and B is near C, all three share one
  conversation even when A and C are further apart. Components of fewer than
  three people are not huddles — pairs keep today's persisted DM.
- **History.** A huddle's messages live in server memory for as long as the
  huddle exists, capped at the last 100. Someone who walks up mid-conversation
  receives that backlog. Nothing is written to SQLite; when the huddle drops
  below three people it dissolves and its messages are discarded.
- **UI.** One docked panel, switching mode. Two people → today's DM,
  unchanged. Three or more → huddle mode: header shows the member count,
  messages carry sender names, the panel closes when the huddle dissolves.

## Architecture

Huddles are **server-authoritative**. The server already receives every
`move` and is the only place holding all positions; computing membership on
the client would duplicate the geometry and let two clients disagree about
who is in the room.

### `backend/src/huddles.js`

- `computeHuddles(players)` — pure. Takes `[id, {x, y}]` entries, returns
  arrays of member ids for each component of size >= 3.
- `createHuddleStore()` — holds `Map<huddleId, {members, messages}>` and
  assigns **stable ids**: on each recompute, a component inherits the id of
  the prior huddle it overlaps most, so the backlog survives membership
  churn. No overlap means a new id.
- `store.sync(players)` returns only the players whose huddle or membership
  actually changed, so nothing is broadcast on an idle tick.

### `backend/src/index.js`

- Movement, joins and leaves mark the world dirty; a 200 ms timer syncs the
  store when dirty. Recomputing inside the `move` handler would run at the
  20 Hz broadcast rate for no benefit.
- Membership delta → affected clients get
  `{type: "huddle", huddleId, members: [{id, name}], messages: [...]}`;
  players who dropped out get `huddleId: null`.
- `{type: "huddle_msg", text}` → look up the sender's huddle, drop the
  message if they are not in one, append, broadcast to members. Reuses the
  existing 1000-character cap.

### Frontend

- `useOfficeSocket` handles the two new message types and exposes
  `sendHuddleRef`; `chatRef` gains `onHuddle` / `onHuddleMessage`.
- `App` holds one `huddle` state object. E / the speech bubble opens the
  huddle when one exists, otherwise a DM. A huddle forming while a DM is
  open switches the panel; dissolving closes it.
- `ChatPanel` stays a single component: messages become
  `{mine, body, createdAt, from?}`, plus a title and optional subtitle.

## Failure modes

- Disconnect mid-huddle: the member is dropped and the next tick recomputes.
- `huddle_msg` after the huddle dissolved: silently dropped; the client's
  composer is already disabled by the `huddleId: null` message.

## Testing

`computeHuddles` and the store's id-stability rule are pure and covered by
`node:test`: a three-person chain whose ends are out of range forms one
huddle; two separate pairs form none; a splitting huddle keeps its id on the
larger remnant; a member walking out shrinks membership.
