import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, ArrowLeftRight, DoorOpen } from "lucide-react";
import { CharacterPreview } from "./CharacterPreview";

/**
 * Picking a desk, or the person at one.
 *
 * A native select can hold the same list, but it can't show you a face or
 * say what picking a row will actually do — and "move Siam to TB-042" and
 * "swap Siam with Rashed" are different enough decisions that the
 * difference should be on screen before you commit, not after.
 *
 * `mode` is what the list is for: "move-to" lists desks to send this person
 * to, "bring-here" lists people to bring to this desk.
 */
export function SeatPicker({ title, subtitle, desks, mode, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Typing straight into the search is the point of it, but not on a
    // phone, where it would throw the keyboard up over the list
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = mode === "bring-here" ? desks.filter((d) => d.occupant) : desks;
    if (!needle) return pool;
    return pool.filter(
      (d) =>
        d.id.toLowerCase().includes(needle) ||
        (d.occupant ?? "").toLowerCase().includes(needle)
    );
  }, [desks, mode, query]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line/70 bg-room shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line/60 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-extrabold tracking-tight text-paper">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-plate hover:text-paper"
          >
            <X size={16} />
          </button>
        </header>

        <label className="relative shrink-0 border-b border-line/60 px-4 py-2.5">
          <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "bring-here" ? "Search people" : "Search desks or people"}
            className="w-full rounded-md border border-line bg-ink/60 py-2 pl-7 pr-2 text-sm text-paper placeholder-muted/70 outline-none focus:border-pick"
          />
        </label>

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches that.</li>
          )}
          {rows.map((desk) => {
            const swap = mode === "move-to" && Boolean(desk.occupant);
            return (
              <li key={desk.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(desk.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-plate/70"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-ink/60">
                    {desk.occupant_character ? (
                      <CharacterPreview name={desk.occupant_character} size={30} />
                    ) : (
                      <DoorOpen size={15} className="text-muted" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-paper">
                      {desk.occupant ?? "Open desk"}
                    </span>
                    <span className="code block text-[10px] text-muted">{desk.id}</span>
                  </span>

                  {swap ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-lit/50 bg-lit/15 px-2 py-1 text-[10px] font-semibold text-lit">
                      <ArrowLeftRight size={10} />
                      Swap
                    </span>
                  ) : (
                    mode === "move-to" && (
                      <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[10px] text-muted">
                        Open
                      </span>
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}
