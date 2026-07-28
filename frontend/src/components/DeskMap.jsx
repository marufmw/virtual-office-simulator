import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Plus, Minus, Maximize } from "lucide-react";
import { LAYOUT_SNAP } from "../config";
import { growRoom, clampToMaxRoom } from "../game/roomBounds";

const PX_PER_UNIT = 18; // floor pixels per world unit at 1:1 zoom
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const FIT_ZOOM_CAP = 1.2; // don't magnify a small office just because it fits
const MIN_SPAN = 12; // mirrors MIN_ROOM_SPAN in the backend's layout.js

const snap = (n) => Math.round(n / LAYOUT_SNAP) * LAYOUT_SNAP;
const spanOf = (room) => ({ w: room.maxX - room.minX, h: room.maxY - room.minY });

/**
 * The desk picker, drawn as the office floor plan. Desks sit where they
 * actually sit in the world, so choosing a seat means choosing a place in
 * the room rather than a code from a list.
 *
 * Claim mode: click a desk to take it. Edit mode: drag desks to rearrange
 * the office, drag a nameplate onto another desk to swap the two people,
 * and drag a desk towards a wall to push the wall outward. The view pans
 * and zooms, since the room can outgrow the panel.
 */
export function DeskMap({
  desks,
  room,
  value,
  onChange,
  editing = false,
  onMove,
  onAdd,
  onDelete,
  onReseat,
  onResizeRoom,
}) {
  const viewportRef = useRef(null);
  const boxRef = useRef(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(null); // null follows the fit-to-panel zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null); // { kind, id, x, y, moved }
  const [panning, setPanning] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(null); // { x, y } awaiting a desk code
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState(null);
  const [wallDrag, setWallDrag] = useState(null); // { side, room } while resizing

  // Show the walls where they're being dragged to: either by a desk pushing
  // one outward, or by a wall handle being pulled in or out by hand
  const shown =
    wallDrag?.room ?? (drag?.kind === "desk" ? growRoom(room, drag.x, drag.y) : room);
  const span = spanOf(shown);
  const floorW = span.w * PX_PER_UNIT;
  const floorH = span.h * PX_PER_UNIT;

  const fitZoom = Math.min(
    FIT_ZOOM_CAP,
    viewport.w && viewport.h ? Math.min(viewport.w / floorW, viewport.h / floorH) : 1
  );
  const scale = zoom ?? fitZoom;

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setViewport({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Leaving edit mode drops any half-finished gesture and refits the view
  useEffect(() => {
    if (!editing) {
      setSelected(null);
      setPending(null);
      setDrag(null);
      setAdding(false);
      setZoom(null);
      setPan({ x: 0, y: 0 });
    }
  }, [editing]);

  const leftOf = (x) => ((x - shown.minX) / span.w) * 100;
  const topOf = (y) => ((shown.maxY - y) / span.h) * 100; // world y points up

  function toWorld(clientX, clientY) {
    const rect = boxRef.current.getBoundingClientRect();
    return clampToMaxRoom(
      snap(shown.minX + ((clientX - rect.left) / rect.width) * span.w),
      snap(shown.maxY - ((clientY - rect.top) / rect.height) * span.h)
    );
  }

  function startDrag(e, desk, kind) {
    if (!editing) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(desk.id);
    setDrag({ kind, id: desk.id, x: desk.x, y: desk.y, moved: false });
  }

  // Dragging a wall handle resizes the office by hand, inward or outward
  function startWallDrag(e, side) {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setWallDrag({ side, room: shown });
  }

  function dragWall(e) {
    const rect = boxRef.current.getBoundingClientRect();
    const world = {
      x: snap(shown.minX + ((e.clientX - rect.left) / rect.width) * span.w),
      y: snap(shown.maxY - ((e.clientY - rect.top) / rect.height) * span.h),
    };
    const even = (n) => Math.round(n / 2) * 2; // walls are laid in 2-unit bricks
    const next = { ...wallDrag.room };

    if (wallDrag.side === "left") next.minX = Math.min(even(world.x), next.maxX - MIN_SPAN);
    if (wallDrag.side === "right") next.maxX = Math.max(even(world.x), next.minX + MIN_SPAN);
    if (wallDrag.side === "bottom") next.minY = Math.min(even(world.y), next.maxY - MIN_SPAN);
    if (wallDrag.side === "top") next.maxY = Math.max(even(world.y), next.minY + MIN_SPAN);

    setWallDrag({ ...wallDrag, room: next });
  }

  function onPointerDown(e) {
    // Dragging the open floor pans the view; placing a desk takes priority
    if (!editing || adding || e.target.closest("[data-desk-id], [data-editor]")) return;
    viewportRef.current.setPointerCapture(e.pointerId);
    setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function onPointerMove(e) {
    if (wallDrag) {
      dragWall(e);
      return;
    }
    if (panning) {
      setPan({ x: e.clientX - panning.x, y: e.clientY - panning.y });
      return;
    }
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
    if (wallDrag) {
      const resized = wallDrag.room;
      setWallDrag(null);
      onResizeRoom(resized);
      return;
    }
    if (panning) {
      setPanning(null);
      return;
    }
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
    const nudge = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }[e.key];

    if (nudge) {
      e.preventDefault();
      const to = clampToMaxRoom(desk.x + nudge[0], desk.y + nudge[1]);
      onMove(desk.id, to.x, to.y);
    } else if ((e.key === "Delete" || e.key === "Backspace") && !desk.occupant) {
      e.preventDefault();
      onDelete(desk.id);
    }
  }

  function onFloorClick(e) {
    if (!editing || drag || panning) return;
    if (e.target.closest("[data-desk-id], [data-editor]")) return;
    setSelected(null);
    if (!adding) return;

    const { x, y } = toWorld(e.clientX, e.clientY);
    setCode("");
    setPending({ x, y });
    setAdding(false);
  }

  function submitPending() {
    if (!code.trim()) return;
    onAdd(code.trim(), pending.x, pending.y);
    setPending(null);
  }

  const zoomBy = (factor) =>
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (current ?? fitZoom) * factor)));

  return (
    <div className="flex flex-col gap-2">
      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAdding((on) => !on);
              setPending(null);
            }}
            aria-pressed={adding}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              adding
                ? "border-pick bg-pick/15 text-pick"
                : "border-line text-muted hover:border-paper/40 hover:text-paper"
            }`}
          >
            <Plus size={14} />
            {adding ? "Click the floor" : "Add desk"}
          </button>

          <span className="code text-[11px] text-muted">
            {shown.maxX - shown.minX} × {shown.maxY - shown.minY} units
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.25)}
              title="Zoom out"
              className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-paper/40 hover:text-paper"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(null);
                setPan({ x: 0, y: 0 });
              }}
              title="Fit the whole office"
              className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-paper/40 hover:text-paper"
            >
              <Maximize size={14} />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1.25)}
              title="Zoom in"
              className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-paper/40 hover:text-paper"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      <div
        ref={viewportRef}
        onClick={onFloorClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative overflow-hidden rounded-lg border bg-ink ${
          editing ? "h-[32rem] border-pick/40" : "h-80 border-line/70"
        } ${adding ? "cursor-crosshair" : panning ? "cursor-grabbing" : editing ? "cursor-grab" : ""}`}
      >
        <div
          ref={boxRef}
          className="absolute left-1/2 top-1/2 origin-center bg-room"
          style={{
            width: `${floorW}px`,
            height: `${floorH}px`,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {/* Floor tiles, so the room reads as a space rather than a chart */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.09]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: `${(2 / span.w) * 100}% ${(2 / span.h) * 100}%`,
            }}
          />

          {/* Grab a wall to resize the office by hand — outward to make
              room, inward to tighten it up */}
          {editing &&
            [
              ["top", "left-0 right-0 top-0 h-2 cursor-ns-resize"],
              ["bottom", "left-0 right-0 bottom-0 h-2 cursor-ns-resize"],
              ["left", "top-0 bottom-0 left-0 w-2 cursor-ew-resize"],
              ["right", "top-0 bottom-0 right-0 w-2 cursor-ew-resize"],
            ].map(([side, position]) => (
              <div
                key={side}
                data-editor=""
                onPointerDown={(e) => startWallDrag(e, side)}
                title={`Drag to move the ${side} wall`}
                className={`absolute z-20 bg-pick/25 transition-colors hover:bg-pick/70 ${position} ${
                  wallDrag?.side === side ? "bg-pick" : ""
                }`}
              />
            ))}

          {desks.map((desk) => {
            const dragging = drag?.id === desk.id;
            const live = dragging && drag.kind === "desk" ? drag : desk;
            const isSelected = desk.id === value;
            const isEditTarget = editing && selected === desk.id;
            const taken = Boolean(desk.occupant);
            const receiving = dropTarget === desk.id && drag?.kind === "person";
            const swapping = receiving && taken; // dropping onto someone trades seats

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

          {/* Inline code entry for a desk being added. A nested <form> would
              bubble its submit up to the profile form around this map. */}
          {pending && (
            <div
              data-editor=""
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ left: `${leftOf(pending.x)}%`, top: `${topOf(pending.y)}%` }}
              className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border border-pick bg-ink p-1 shadow-xl"
            >
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPending(null);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitPending();
                  }
                }}
                placeholder="TB-000"
                maxLength={20}
                className="code w-20 bg-transparent px-1 text-[11px] text-paper placeholder-muted/60 outline-none"
              />
              <button
                type="button"
                onClick={submitPending}
                className="rounded bg-pick px-2 py-0.5 text-[11px] font-bold text-ink hover:bg-pick/85"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
