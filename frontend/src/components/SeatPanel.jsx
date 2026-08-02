import { useEffect, useState } from "react";
import { Check, ArrowLeftRight, UserMinus, UserPlus } from "lucide-react";
import { CharacterPreview } from "./CharacterPreview";
import { SeatPicker } from "./SeatPicker";

/**
 * Everything you can do to whoever sits at a desk, without dragging.
 *
 * Dragging a nameplate across the plan is fine when you can see both desks
 * at once, and hopeless when you can't — so the same three moves are here as
 * plain controls: rename them, send them to another desk, or empty the seat.
 * Sending someone to a desk that's already taken swaps the two, which is
 * what the drag has always done.
 */
export function SeatPanel({ desk, desks, onRename, onReseat, onClear }) {
  const [name, setName] = useState(desk.occupant ?? "");
  const [picking, setPicking] = useState(null); // "move-to" | "bring-here"

  // Following the selection means the field always shows this desk's person
  useEffect(() => {
    setName(desk.occupant ?? "");
    setPicking(null);
  }, [desk.id, desk.occupant]);

  const others = desks.filter((d) => d.id !== desk.id);
  const trimmed = name.trim();
  const renamed = trimmed !== "" && trimmed !== desk.occupant;

  const picker =
    picking === "move-to" ? (
      <SeatPicker
        title={`Move ${desk.occupant}`}
        subtitle="Landing on a taken desk swaps the two of them."
        desks={others}
        mode="move-to"
        onPick={(toDeskId) => onReseat(desk.id, toDeskId)}
        onClose={() => setPicking(null)}
      />
    ) : picking === "bring-here" ? (
      <SeatPicker
        title={`Who sits at ${desk.id}?`}
        subtitle="They keep their name, character and chat history."
        desks={others}
        mode="bring-here"
        onPick={(fromDeskId) => onReseat(fromDeskId, desk.id)}
        onClose={() => setPicking(null)}
      />
    ) : null;

  // An empty desk: the only move is to bring somebody to it
  if (!desk.occupant) {
    return (
      <div className="flex flex-col gap-2">
        <p className="code text-[10px] uppercase text-muted">Seat</p>
        <p className="text-sm text-muted">Open</p>

        {others.some((d) => d.occupant) && (
          <button
            type="button"
            onClick={() => setPicking("bring-here")}
            className="mt-1 flex items-center justify-center gap-2 rounded-md border border-line py-2.5 text-sm text-muted transition-colors hover:border-pick hover:text-paper"
          >
            <UserPlus size={14} />
            Seat someone here
          </button>
        )}
        {picker}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="code text-[10px] uppercase text-muted">Seat</p>
        <p className="flex items-center gap-2.5 text-sm text-paper">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-ink/60">
            <CharacterPreview name={desk.occupant_character} size={28} />
          </span>
          <span className="min-w-0 truncate">{desk.occupant}</span>
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="code text-[10px] uppercase text-muted">Name</span>
        <div className="flex gap-1.5">
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renamed) onRename(desk.id, trimmed);
              if (e.key === "Escape") setName(desk.occupant ?? "");
            }}
            className="min-w-0 flex-1 rounded-md border border-line bg-room px-2 py-2 text-sm text-paper outline-none focus:border-pick"
          />
          <button
            type="button"
            disabled={!renamed}
            onClick={() => onRename(desk.id, trimmed)}
            title="Save the new name"
            aria-label="Save the new name"
            className="flex w-10 shrink-0 items-center justify-center rounded-md bg-pick text-ink transition-colors hover:bg-pick/85 disabled:bg-plate disabled:text-muted"
          >
            <Check size={15} />
          </button>
        </div>
      </label>

      <button
        type="button"
        onClick={() => setPicking("move-to")}
        className="flex items-center justify-center gap-2 rounded-md border border-line py-2.5 text-sm text-muted transition-colors hover:border-pick hover:text-paper"
      >
        <ArrowLeftRight size={14} />
        Move to another desk
      </button>

      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Take ${desk.occupant} off ${desk.id}? Their chat history goes too.`)) {
            onClear(desk.id);
          }
        }}
        className="flex items-center justify-center gap-2 rounded-md border border-line py-2.5 text-sm text-muted transition-colors hover:border-red-400/60 hover:text-red-300"
      >
        <UserMinus size={14} />
        Empty this seat
      </button>

      {picker}
    </div>
  );
}
