import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ROOM_BOUNDS, LAYOUT_SNAP } from "../config";

const { minX, maxX, minY, maxY } = ROOM_BOUNDS;
const WIDTH = maxX - minX;
const HEIGHT = maxY - minY;

const snap = (n) => Math.round(n / LAYOUT_SNAP) * LAYOUT_SNAP;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

// World coordinates -> percentage offsets. World y points up, screen y down.
const leftOf = (x) => ((x - minX) / WIDTH) * 100;
const topOf = (y) => ((maxY - y) / HEIGHT) * 100;

/**
 * The desk picker, drawn as the office floor plan. Desks sit where they
 * actually sit in the world, so choosing a seat means choosing a place in
 * the room rather than a code from a list.
 *
 * Claim mode: click a desk to take it. Edit mode: drag desks to rearrange
 * the office, drag a nameplate onto another desk to reseat that person,
 * click open floor to add a desk, and delete the one you've selected.
 */
export function DeskMap({
  desks,
  value,
  onChange,
  editing = false,
  onMove,
  onAdd,
  onDelete,
  onReseat,
}) {
  const boxRef = useRef(null);
  const [drag, setDrag] = useState(null); // { kind, id, x, y, moved }
  const [dropTarget, setDropTarget] = useState(null); // desk id under a person drag
  const [pending, setPending] = useState(null); // { x, y } awaiting a desk code
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState(null);

  // Leaving edit mode drops any half-finished gesture
  useEffect(() => {
    if (!editing) {
      setSelected(null);
      setPending(null);
      setDrag(null);
    }
  }, [editing]);

  function toWorld(clientX, clientY) {
    const rect = boxRef.current.getBoundingClientRect();
    return {
      x: clamp(snap(minX + ((clientX - rect.left) / rect.width) * WIDTH), minX, maxX),
      y: clamp(snap(maxY - ((clientY - rect.top) / rect.height) * HEIGHT), minY, maxY),
    };
  }

  function startDrag(e, desk, kind) {
    if (!editing) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(desk.id);
    setDrag({ kind, id: desk.id, x: desk.x, y: desk.y, moved: false });
  }

  function onPointerMove(e) {
    if (!drag) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (drag.kind === "person") {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-desk-id]");
      setDropTarget(under?.dataset.deskId ?? null);
      setDrag((d) => ({ ...d, x, y, moved: true }));
      return;
    }
    if (x !== drag.x || y !== drag.y) setDrag((d) => ({ ...d, x, y, moved: true }));
  }

  function onPointerUp() {
    if (!drag) return;
    const finished = drag;
    setDrag(null);
    setDropTarget(null);

    if (!finished.moved) return; // a click, not a drag
    if (finished.kind === "person") {
      if (dropTarget && dropTarget !== finished.id) onReseat(finished.id, dropTarget);
      return;
    }
    onMove(finished.id, finished.x, finished.y);
  }

  // Arrow keys nudge the selected desk, so rearranging works without a mouse
  function onKeyDown(e, desk) {
    if (!editing) return;
    const step = e.shiftKey ? 1 : LAYOUT_SNAP;
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (nudge) {
      e.preventDefault();
      onMove(desk.id, clamp(desk.x + nudge[0], minX, maxX), clamp(desk.y + nudge[1], minY, maxY));
    } else if ((e.key === "Delete" || e.key === "Backspace") && !desk.occupant) {
      e.preventDefault();
      onDelete(desk.id);
    }
  }

  function onFloorClick(e) {
    if (!editing || drag) return;
    if (e.target.closest("[data-desk-id]")) return;
    setSelected(null);
    const { x, y } = toWorld(e.clientX, e.clientY);
    setCode("");
    setPending({ x, y });
  }

  function submitPending(e) {
    e.preventDefault();
    if (!code.trim()) return;
    onAdd(code.trim(), pending.x, pending.y);
    setPending(null);
  }

  return (
    <div className="overflow-x-auto">
      <div
        ref={boxRef}
        onClick={onFloorClick}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative min-w-[44rem] rounded-lg border bg-room ${
          editing ? "cursor-copy border-pick/40" : "border-line/70"
        }`}
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      >
        {/* Floor tiles, so the room reads as a space rather than a chart */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg opacity-[0.09]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: `${(2 / WIDTH) * 100}% ${(2 / HEIGHT) * 100}%`,
          }}
        />

        {desks.map((desk) => {
          const dragging = drag?.id === desk.id;
          const live = dragging && drag.kind === "desk" ? drag : desk;
          const isSelected = desk.id === value;
          const isEditTarget = editing && selected === desk.id;
          const taken = Boolean(desk.occupant);
          const receiving = dropTarget === desk.id && drag?.kind === "person";
          // Dropping onto someone trades the two seats
          const swapping = receiving && taken;

          return (
            <div
              key={desk.id}
              data-desk-id={desk.id}
              style={{ left: `${leftOf(live.x)}%`, top: `${topOf(live.y)}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                dragging ? "z-20" : isSelected || isEditTarget ? "z-10" : ""
              }`}
            >
              <button
                type="button"
                onPointerDown={(e) => editing && startDrag(e, desk, "desk")}
                onClick={() => (editing ? setSelected(desk.id) : onChange(desk.id))}
                onKeyDown={(e) => onKeyDown(e, desk)}
                aria-pressed={isSelected}
                aria-label={
                  taken ? `Desk ${desk.id}, ${desk.occupant} sits here` : `Desk ${desk.id}, open`
                }
                className={`flex w-full flex-col items-center gap-1 rounded-md border px-2.5 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pick focus-visible:ring-offset-2 focus-visible:ring-offset-room ${
                  editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                } ${dragging ? "opacity-90 shadow-lg shadow-black/40" : ""} ${
                  swapping
                    ? "border-lit bg-lit/25 ring-2 ring-lit"
                    : receiving
                      ? "border-pick bg-pick/25 ring-2 ring-pick"
                    : isEditTarget
                      ? "border-pick bg-pick/10"
                      : isSelected
                        ? "border-pick bg-pick/15 shadow-[0_0_0_3px_rgba(56,189,248,0.25)]"
                        : taken
                          ? "border-lit/45 bg-lit/10 hover:border-lit hover:bg-lit/20"
                          : "border-line bg-plate/70 hover:border-paper/50 hover:bg-plate"
                }`}
              >
                <span
                  className={`code text-[10px] leading-none font-bold ${
                    isSelected || isEditTarget ? "text-pick" : taken ? "text-lit" : "text-muted"
                  }`}
                >
                  {desk.id}
                </span>

                {/* In edit mode the nameplate is its own handle: drag the
                    person, not the furniture */}
                <span
                  onPointerDown={(e) => taken && startDrag(e, desk, "person")}
                  className={`max-w-16 truncate rounded px-1 text-[10px] leading-none ${
                    taken ? "text-paper/85" : "text-muted/60"
                  } ${editing && taken ? "cursor-grab bg-lit/15 hover:bg-lit/30" : ""}`}
                >
                  {desk.occupant ?? "open"}
                </span>
              </button>

              {isEditTarget && !taken && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(desk.id);
                  }}
                  title={`Remove ${desk.id}`}
                  className="absolute -right-2 -top-2 rounded-full border border-line bg-ink p-0.5 text-muted transition-colors hover:border-red-400 hover:text-red-400"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Ghost following a person being reseated */}
        {drag?.kind === "person" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded bg-lit px-2 py-1 text-[10px] font-semibold text-ink shadow-lg"
            style={{ left: `${leftOf(drag.x)}%`, top: `${topOf(drag.y)}%` }}
          >
            {desks.find((d) => d.id === drag.id)?.occupant}
            {(() => {
              const onto = desks.find((d) => d.id === dropTarget);
              return onto?.occupant && onto.id !== drag.id ? ` ⇄ ${onto.occupant}` : "";
            })()}
          </div>
        )}

        {/* Inline code entry for a desk being added */}
        {pending && (
          <form
            onSubmit={submitPending}
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${leftOf(pending.x)}%`, top: `${topOf(pending.y)}%` }}
            className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border border-pick bg-ink p-1 shadow-xl"
          >
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setPending(null)}
              placeholder="TB-000"
              maxLength={20}
              className="code w-20 bg-transparent px-1 text-[11px] text-paper placeholder-muted/60 outline-none"
            />
            <button
              type="submit"
              className="rounded bg-pick px-2 py-0.5 text-[11px] font-bold text-ink hover:bg-pick/85"
            >
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
