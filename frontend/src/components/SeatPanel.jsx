import { UserMinus } from "lucide-react";
import { CharacterPreview } from "./CharacterPreview";

/**
 * Who sits at the selected desk, and how to change that.
 *
 * Seating is by email: the list is the office's member list, so a desk can
 * only ever be given to somebody who has been let in. Picking a member who
 * already sits elsewhere moves them here and leaves their old desk empty.
 */
export function SeatPanel({ desk, members, onAssign }) {
  const seated = members?.find((m) => m.email === desk.email) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="code text-[10px] uppercase text-muted">Seat</p>
        {desk.email ? (
          <p className="flex items-center gap-2.5 text-sm text-paper">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-ink/60">
              <CharacterPreview name={desk.character} size={28} />
            </span>
            <span className="min-w-0">
              <span className="block truncate">{desk.occupant ?? seated?.name ?? "Waiting"}</span>
              <span className="code block truncate text-[10px] text-muted">{desk.email}</span>
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted">Empty</p>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="code text-[10px] uppercase text-muted">Sat here</span>
        <select
          value={desk.email ?? ""}
          onChange={(e) => onAssign(desk.id, e.target.value || null)}
          className="rounded-md border border-line bg-room px-2 py-2 text-sm text-paper outline-none transition-colors focus:border-pick"
        >
          <option value="">Nobody</option>
          {(members ?? []).map((member) => (
            <option key={member.email} value={member.email}>
              {member.name ?? member.email}
              {member.seat && member.seat.id !== desk.id ? ` · at ${member.seat.code}` : ""}
            </option>
          ))}
        </select>
      </label>

      {members?.length === 0 && (
        <p className="text-xs leading-relaxed text-muted/80">
          Nobody is on the member list yet — add them in the Members tab, then sit them down.
        </p>
      )}

      {desk.email && (
        <button
          type="button"
          onClick={() => onAssign(desk.id, null)}
          className="flex items-center justify-center gap-2 rounded-md border border-line py-2.5 text-sm text-muted transition-colors hover:border-red-400/60 hover:text-red-300"
        >
          <UserMinus size={14} />
          Empty this seat
        </button>
      )}
    </div>
  );
}
