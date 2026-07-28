import { useEffect, useState } from "react";
import { LayoutGrid, ArrowRight, Check } from "lucide-react";
import { CHARACTER_NAMES } from "../game/createAnimatedPlayer";
import { CharacterPreview } from "./CharacterPreview";
import { DeskMap } from "./DeskMap";
import { LayoutEditor } from "./LayoutEditor";
import { useOfficeLayout } from "../hooks/useOfficeLayout";

/**
 * Full-screen profile setup, shared by the join screen and the in-game
 * settings: the floor plan on the left to pick a seat, the badge you'll
 * walk in with on the right. Rearranging the office happens in the layout
 * editor, which takes over the same surface.
 */
export function ProfileForm({ title, initial, submitLabel, onSubmit, onClose }) {
  const [name, setName] = useState(initial.name ?? "");
  const [deskId, setDeskId] = useState(initial.deskId ?? "");
  const [character, setCharacter] = useState(initial.character ?? CHARACTER_NAMES[0]);
  const [editing, setEditing] = useState(false);

  const office = useOfficeLayout({
    // Follow the person or desk this form is pointed at
    onSeatChange: (fromDeskId, toDeskId) =>
      setDeskId((current) =>
        current === fromDeskId ? toDeskId : current === toDeskId ? fromDeskId : current
      ),
    onDeskRemoved: (id) => setDeskId((current) => (current === id ? "" : current)),
  });
  const { desks, room, failed, problem } = office;

  // Picking a desk that already has someone at it means carrying on as
  // them, so their name and character come along
  function chooseDesk(id) {
    setDeskId(id);
    const desk = desks?.find((d) => d.id === id);
    if (desk?.occupant) {
      setName(desk.occupant);
      if (desk.occupant_character) setCharacter(desk.occupant_character);
    } else {
      setName("");
      setCharacter(CHARACTER_NAMES[0]);
    }
  }

  // Preselect the current desk once the floor plan arrives
  useEffect(() => {
    if (!initial.deskId || !desks) return;
    setDeskId(initial.deskId);
    const desk = desks.find((d) => d.id === initial.deskId);
    if (desk?.occupant) {
      setName(desk.occupant);
      if (desk.occupant_character) setCharacter(desk.occupant_character);
    }
  }, [initial.deskId, desks]);

  const selected = desks?.find((d) => d.id === deskId) ?? null;
  const taken = desks?.filter((d) => d.occupant).length ?? 0;
  const canSubmit = name.trim() !== "" && deskId.trim() !== "";

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), deskId: deskId.trim(), character });
    window?.location.reload();
  }

  async function handleReset() {
    if (!window.confirm("Put the office back to its original layout? This clears every desk.")) {
      return;
    }
    if (await office.reset()) {
      setDeskId("");
      setName("");
    }
  }

  if (editing) {
    return (
      <LayoutEditor
        desks={desks ?? []}
        room={room}
        problem={problem}
        onDismissProblem={() => office.setProblem(null)}
        onMove={office.moveDesk}
        onAdd={office.addDesk}
        onDelete={office.removeDesk}
        onReseat={office.reseat}
        onResizeRoom={office.resizeRoom}
        onReset={handleReset}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="fixed inset-0 z-30 flex flex-col bg-ink text-paper">
      {/* Top bar, matching the layout editor's */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line/60 px-4 py-2.5">
        <h1 className="font-display text-base font-extrabold tracking-tight">{title}</h1>
        <p className="code hidden text-[11px] text-muted sm:block">
          {desks === null ? "reading floor plan" : `${desks.length} desks · ${taken} taken`}
        </p>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={desks === null || failed}
            className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-paper/40 hover:text-paper disabled:opacity-40"
          >
            <LayoutGrid size={14} />
            Edit layout
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-paper/40 hover:text-paper"
            >
              Cancel
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The office */}
        <div className="relative min-h-64 flex-1">
          {desks === null ? (
            <Placeholder>
              <p className="code text-xs text-muted">reading floor plan…</p>
            </Placeholder>
          ) : failed ? (
            <Placeholder>
              <p className="text-sm text-paper">The office isn&rsquo;t answering.</p>
              <p className="text-xs text-muted">Start the server, then reload this page.</p>
            </Placeholder>
          ) : desks.length === 0 ? (
            <Placeholder>
              <p className="text-sm text-muted">No desks have been set up yet.</p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md bg-pick px-4 py-2 text-sm font-bold text-ink hover:bg-pick/85"
              >
                Lay out the office
              </button>
            </Placeholder>
          ) : (
            <DeskMap desks={desks} room={room} value={deskId} onChange={chooseDesk} />
          )}

          {problem && (
            <p
              role="status"
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-red-400/40 bg-red-950/90 px-4 py-2 text-sm text-red-100 shadow-xl"
            >
              {problem}
            </p>
          )}
        </div>

        {/* The badge you walk in with */}
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-t border-line/60 p-5 lg:w-80 lg:border-l lg:border-t-0">
          <div className="rounded-xl border border-line/70 bg-room p-4">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-lg border border-line bg-ink/70 p-2">
                <CharacterPreview name={character} size={64} />
              </div>
              <div className="min-w-0">
                <p className="code text-lg font-bold text-pick">{deskId || "—"}</p>
                <p className="truncate text-sm text-muted">
                  {selected?.occupant
                    ? `Continuing as ${selected.occupant}`
                    : deskId
                      ? "Open desk"
                      : "Pick a desk on the plan"}
                </p>
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="code text-[10px] uppercase text-muted">Name</span>
            <input
              className="rounded-md border border-line bg-room px-3 py-2 text-paper placeholder-muted/60 outline-none transition-colors focus:border-pick"
              placeholder="What should we call you?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>

          <div className="flex min-h-0 flex-col gap-2">
            <span className="code text-[10px] uppercase text-muted">Character</span>
            <div className="grid grid-cols-5 gap-1.5">
              {CHARACTER_NAMES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCharacter(c)}
                  title={c.replaceAll("_", " ")}
                  aria-pressed={character === c}
                  className={`relative flex aspect-square items-center justify-center rounded-md border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pick ${
                    character === c
                      ? "border-pick bg-pick/15"
                      : "border-line/50 bg-room hover:border-line hover:bg-plate/60"
                  }`}
                >
                  <CharacterPreview name={c} size={38} />
                  {character === c && (
                    <Check size={10} className="absolute right-0.5 top-0.5 text-pick" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center justify-center gap-2 rounded-md bg-pick py-2.5 font-display font-bold text-ink transition-colors hover:bg-pick/85 disabled:cursor-not-allowed disabled:bg-plate disabled:text-muted"
            >
              {submitLabel}
              <ArrowRight size={16} />
            </button>
            {!canSubmit && (
              <p className="text-center text-xs text-muted">
                {deskId ? "Add your name to continue." : "Choose a desk on the plan."}
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Status bar, matching the editor's */}
      <footer className="code flex shrink-0 items-center gap-4 border-t border-line/60 px-4 py-1.5 text-[10px] text-muted">
        <span>
          room {room.maxX - room.minX} × {room.maxY - room.minY}
        </span>
        {selected ? (
          <span className="text-pick">
            {selected.id} {selected.occupant ? `· ${selected.occupant}` : "· open"}
          </span>
        ) : (
          <span>no desk selected</span>
        )}
        <span className="ml-auto hidden sm:block">drag to pan · scroll to zoom</span>
      </footer>
    </form>
  );
}

function Placeholder({ children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-ink">{children}</div>
  );
}
