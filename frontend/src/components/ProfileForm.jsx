import { useEffect, useState } from "react";
import { LayoutGrid, RotateCcw } from "lucide-react";
import { CHARACTER_NAMES } from "../game/createAnimatedPlayer";
import { CharacterPreview } from "./CharacterPreview";
import { DeskMap } from "./DeskMap";
import * as layout from "../api/layout";
import { DEFAULT_ROOM, growRoom } from "../game/roomBounds";
import { API_URL } from "../config";

/**
 * Full-screen profile setup, shared by the join screen and the in-game
 * settings. The desk picker is the office floor plan itself, so you pick
 * a place to sit rather than a code from a list; the badge on the right
 * fills in as you choose.
 */
export function ProfileForm({ title, initial, submitLabel, onSubmit, onClose }) {
  const [name, setName] = useState(initial.name ?? "");
  const [deskId, setDeskId] = useState(initial.deskId ?? "");
  const [character, setCharacter] = useState(initial.character ?? CHARACTER_NAMES[0]);
  const [desks, setDesks] = useState(null); // null while loading
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState(null); // why the last edit was refused

  // Picking a desk that already has someone at it means carrying on as
  // them, so their name and character come along
  function prefillFromDesk(id, list) {
    const desk = list?.find((d) => d.id === id);
    if (desk?.occupant) {
      setName(desk.occupant);
      if (desk.occupant_character) setCharacter(desk.occupant_character);
    } else {
      setName("");
      setCharacter(CHARACTER_NAMES[0]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/office`)
      .then((res) => res.json())
      .then(({ room: loadedRoom, desks: data }) => {
        if (cancelled) return;
        setDesks(data);
        setRoom(loadedRoom ?? DEFAULT_ROOM);
        // Only preselect when editing an existing profile
        if (initial.deskId) {
          setDeskId(initial.deskId);
          prefillFromDesk(initial.deskId, data);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDesks([]);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initial.deskId]);

  /**
   * Applies a layout edit straight away so dragging feels immediate, then
   * puts the old floor plan back if the server refuses it.
   */
  async function edit(optimistic, call, optimisticRoom) {
    const beforeDesks = desks;
    const beforeRoom = room;
    setDesks(optimistic);
    if (optimisticRoom) setRoom(optimisticRoom);
    setProblem(null);

    const result = await call();
    if (!result.ok) {
      setDesks(beforeDesks);
      setRoom(beforeRoom);
      setProblem(result.error);
      return;
    }
    // The server decides the room; a desk pushed outward will have grown it
    if (result.data?.room) setRoom(result.data.room);
  }

  const handleMove = (id, x, y) =>
    edit(
      desks.map((d) => (d.id === id ? { ...d, x, y } : d)),
      () => layout.moveDesk(id, x, y),
      growRoom(room, x, y)
    );

  const handleAdd = (id, x, y) =>
    edit(
      [...desks, { id, x, y, occupant: null, occupant_character: null }],
      () => layout.createDesk(id, x, y),
      growRoom(room, x, y)
    );

  // Dragging a wall by hand, which may shrink the office as well as grow it
  const handleResizeRoom = (next) => edit(desks, () => layout.setRoom(next), next);

  const handleDelete = (id) => {
    if (id === deskId) setDeskId("");
    return edit(
      desks.filter((d) => d.id !== id),
      () => layout.deleteDesk(id)
    );
  };

  // Dropping someone on an occupied desk trades the two places
  const handleReseat = (fromDeskId, toDeskId) => {
    const mover = desks.find((d) => d.id === fromDeskId);
    const target = desks.find((d) => d.id === toDeskId);
    const seatOf = (desk) => ({
      occupant: desk.occupant,
      occupant_character: desk.occupant_character,
    });

    const next = desks.map((d) => {
      if (d.id === fromDeskId) return { ...d, ...seatOf(target) };
      if (d.id === toDeskId) return { ...d, ...seatOf(mover) };
      return d;
    });

    // Follow whichever person we were about to sit as
    if (deskId === fromDeskId) setDeskId(toDeskId);
    else if (deskId === toDeskId && target.occupant) setDeskId(fromDeskId);

    return edit(next, () => layout.reseatPerson(fromDeskId, toDeskId));
  };

  async function handleReset() {
    if (!window.confirm("Put the office back to its original layout? This clears every desk.")) {
      return;
    }
    const result = await layout.resetLayout();
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    setDesks(result.data.desks);
    setRoom(result.data.room ?? DEFAULT_ROOM);
    setDeskId("");
    setName("");
    setProblem(null);
  }

  const selected = desks?.find((d) => d.id === deskId) ?? null;
  const taken = desks?.filter((d) => d.occupant).length ?? 0;
  const canSubmit = name.trim() !== "" && deskId.trim() !== "";

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), deskId: deskId.trim(), character });
    window?.location.reload();
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-ink text-paper">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-6 lg:p-10"
      >
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-5">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight lg:text-4xl">
              {editing ? "Arrange the office" : title}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {editing
                ? "Drag desks to move them, or a wall to resize the office. Push a desk at a wall and the room grows; drag a nameplate onto someone to swap seats."
                : "Pick where you want to sit."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="code mr-2 text-xs text-muted">
              {desks === null ? "reading floor plan" : `${desks.length} desks · ${taken} taken`}
            </p>
            {editing && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-red-400/60 hover:text-red-300"
              >
                <RotateCcw size={14} />
                Reset layout
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing((on) => !on)}
              aria-pressed={editing}
              disabled={desks === null || failed}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                editing
                  ? "border-pick bg-pick/15 text-pick"
                  : "border-line text-muted hover:border-paper/40 hover:text-paper"
              }`}
            >
              <LayoutGrid size={14} />
              {editing ? "Done editing" : "Edit layout"}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-paper/40 hover:text-paper"
              >
                Cancel
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_21rem]">
          <section className="flex flex-col gap-3">
            {desks === null ? (
              <div className="flex h-72 items-center justify-center rounded-lg border border-line/70 bg-room">
                <p className="code text-xs text-muted">reading floor plan…</p>
              </div>
            ) : failed ? (
              <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-line/70 bg-room">
                <p className="text-sm text-paper">The office isn&rsquo;t answering.</p>
                <p className="text-xs text-muted">Start the server, then reload this page.</p>
              </div>
            ) : desks.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-lg border border-line/70 bg-room">
                <p className="text-sm text-muted">No desks have been set up yet.</p>
              </div>
            ) : (
              <DeskMap
                desks={desks}
                room={room}
                value={deskId}
                onChange={(id) => {
                  setDeskId(id);
                  prefillFromDesk(id, desks);
                }}
                editing={editing}
                onMove={handleMove}
                onAdd={handleAdd}
                onDelete={handleDelete}
                onReseat={handleReseat}
                onResizeRoom={handleResizeRoom}
              />
            )}

            {problem && (
              <p
                role="status"
                className="rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-200"
              >
                {problem}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-5 text-xs text-muted">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-lit/45 bg-lit/20" />
                Someone sits here
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-line bg-plate" />
                Open
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-pick bg-pick/25" />
                {editing ? "Selected" : "Your desk"}
              </span>
              {editing && (
                <span className="text-muted/70">
                  Arrow keys nudge the selected desk · Shift for bigger steps · Delete removes it
                </span>
              )}
            </div>
          </section>

          {/* The badge: who walks into the room, filled in as you choose */}
          <aside className="flex flex-col gap-5 self-start rounded-xl border border-line/70 bg-room p-5">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />

            <div className="flex items-center gap-4">
              <div className="rounded-lg border border-line bg-ink/70 p-2">
                <CharacterPreview name={character} size={72} />
              </div>
              <div className="min-w-0">
                <p className="code text-lg font-bold text-pick">{deskId || "—"}</p>
                <p className="truncate text-sm text-muted">
                  {selected?.occupant
                    ? `Continuing as ${selected.occupant}`
                    : deskId
                      ? "Open desk"
                      : "No desk chosen yet"}
                </p>
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="code text-[11px] uppercase text-muted">Name</span>
              <input
                className="rounded-md border border-line bg-ink px-3 py-2 text-paper placeholder-muted/60 outline-none transition-colors focus:border-pick"
                placeholder="What should we call you?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="code text-[11px] uppercase text-muted">Character</span>
              <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
                {CHARACTER_NAMES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCharacter(c)}
                    title={c.replaceAll("_", " ")}
                    aria-pressed={character === c}
                    className={`flex items-center justify-center rounded-lg border p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pick ${
                      character === c
                        ? "border-pick bg-pick/15"
                        : "border-transparent bg-ink/60 hover:border-line"
                    }`}
                  >
                    <CharacterPreview name={c} size={44} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-pick py-2.5 font-display font-bold text-ink transition-colors hover:bg-pick/85 disabled:cursor-not-allowed disabled:bg-plate disabled:text-muted"
              >
                {submitLabel}
              </button>
              {!canSubmit && (
                <p className="text-center text-xs text-muted">
                  {deskId ? "Add your name to continue." : "Choose a desk on the plan."}
                </p>
              )}
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
