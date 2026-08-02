import { useEffect, useState } from "react";
import {
  MousePointer2,
  Plus,
  Minus,
  Maximize2,
  RotateCcw,
  Trash2,
  User,
  X,
  Check,
} from "lucide-react";
import { LAYOUT_SNAP } from "../config";
import { growRoom, clampToMaxRoom, MAX_ROOM } from "../game/roomBounds";
import { DESK_UNITS } from "../game/deskSize";
import {
  PX,
  CANVAS_BACKDROP,
  deskTone,
  useCanvasView,
  usePinchZoom,
  useWheelZoom,
} from "./canvas/officeView";
import { RoomFrame, TouchPad, BoardPlate } from "./canvas/officeCanvas";

const GUIDE_TOLERANCE = 0.4; // how close counts as aligned with another desk
const MIN_SPAN = 12; // mirrors MIN_ROOM_SPAN in the backend's layout.js
const LABEL_ZOOM = 0.45; // below this, plates are too small for text

const snap = (n) => Math.round(n / LAYOUT_SNAP) * LAYOUT_SNAP;
const even = (n) => Math.round(n / 2) * 2; // walls are laid in 2-unit bricks
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Full-screen floor-plan editor: a pannable, zoomable canvas with the
 * office drawn to scale, a list of desks, and an inspector for whatever is
 * selected. Desks are dragged to rearrange, nameplates dragged to swap
 * people, and the walls dragged to resize the room.
 */
export function LayoutEditor({
  desks,
  room,
  problem,
  onDismissProblem,
  onMove,
  onAdd,
  onDelete,
  onReseat,
  onResizeRoom,
  onReset,
  onClose,
}) {
  const [tool, setTool] = useState("select");
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null); // { kind, id, x, y, moved }
  const [wallDrag, setWallDrag] = useState(null); // { side, room }
  const [panning, setPanning] = useState(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [pending, setPending] = useState(null); // { x, y } awaiting a desk code
  const [code, setCode] = useState("");
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  // The room as it is being dragged, so walls follow the pointer live
  const shown =
    wallDrag?.room ?? (drag?.kind === "desk" ? growRoom(room, drag.x, drag.y) : room);
  const selected = desks.find((d) => d.id === selectedId) ?? null;

  // Pan, zoom and the screen-to-world conversion, shared with the picker
  const {
    canvasRef,
    span,
    zoom,
    pan,
    setView,
    fit: fitToRoom,
    toWorld,
    zoomAround,
  } = useCanvasView(shown);
  const pinch = usePinchZoom({ zoom, zoomAround });
  useWheelZoom(canvasRef, zoomAround);

  // Alignment guides: a dragged desk snaps to another's row or column
  function alignedPosition(id, x, y) {
    let guideX = null;
    let guideY = null;
    let outX = x;
    let outY = y;

    for (const other of desks) {
      if (other.id === id) continue;
      if (guideX === null && Math.abs(other.x - x) <= GUIDE_TOLERANCE) {
        outX = other.x;
        guideX = other.x;
      }
      if (guideY === null && Math.abs(other.y - y) <= GUIDE_TOLERANCE) {
        outY = other.y;
        guideY = other.y;
      }
    }
    return { x: outX, y: outY, guideX, guideY };
  }

  function startDeskDrag(e, desk, kind) {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(desk.id);
    setDrag({ kind, id: desk.id, x: desk.x, y: desk.y, moved: false, guideX: null, guideY: null });
  }

  function startWallDrag(e, side) {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setWallDrag({ side, room: shown });
  }

  function onCanvasPointerDown(e) {
    pinch.onPointerDown(e);
    if (e.target.closest("[data-desk], [data-wall], [data-editor]")) return;
    if (pinch.pinching) return setPanning(null);
    // Space or the middle button pans from anywhere, as does empty canvas
    if (spaceHeld || e.button === 1 || tool === "select") {
      canvasRef.current.setPointerCapture(e.pointerId);
      setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedId(null);
    }
  }

  function onCanvasPointerMove(e) {
    pinch.onPointerMove(e);
    // A pinch is a view change, not a drag of anything in the room
    if (pinch.pinching) return;

    const world = toWorld(e.clientX, e.clientY);
    setCursor({ x: round1(world.x), y: round1(world.y) });

    if (panning) {
      setView({ zoom, panX: e.clientX - panning.x, panY: e.clientY - panning.y });
      return;
    }

    if (wallDrag) {
      const next = { ...wallDrag.room };
      const { side } = wallDrag;
      if (side === "left") next.minX = clamp(even(world.x), MAX_ROOM.minX, next.maxX - MIN_SPAN);
      if (side === "right") next.maxX = clamp(even(world.x), next.minX + MIN_SPAN, MAX_ROOM.maxX);
      if (side === "bottom") next.minY = clamp(even(world.y), MAX_ROOM.minY, next.maxY - MIN_SPAN);
      if (side === "top") next.maxY = clamp(even(world.y), next.minY + MIN_SPAN, MAX_ROOM.maxY);
      setWallDrag({ ...wallDrag, room: next });
      return;
    }

    if (!drag) return;

    if (drag.kind === "person") {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-desk]");
      setDropTarget(under?.dataset.desk ?? null);
      setDrag((d) => ({ ...d, x: world.x, y: world.y, moved: true }));
      return;
    }

    const limited = clampToMaxRoom(snap(world.x), snap(world.y));
    const aligned = alignedPosition(drag.id, limited.x, limited.y);
    setDrag((d) => ({ ...d, ...aligned, moved: true }));
  }

  function onCanvasPointerUp(e) {
    if (e) pinch.onPointerUp(e);
    if (panning) {
      setPanning(null);
      return;
    }
    if (wallDrag) {
      const resized = wallDrag.room;
      setWallDrag(null);
      onResizeRoom(resized);
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

  function onCanvasClick(e) {
    if (e.target.closest("[data-desk], [data-wall], [data-editor]")) return;
    if (tool !== "add" || drag || panning) return;
    const world = toWorld(e.clientX, e.clientY);
    const limited = clampToMaxRoom(snap(world.x), snap(world.y));
    setCode("");
    setPending(limited);
    setTool("select");
  }

  // Keyboard shortcuts, ignored while typing into a field
  useEffect(() => {
    const typing = (target) =>
      target instanceof HTMLElement && target.closest("input, textarea");

    const onKeyDown = (e) => {
      if (e.code === "Space" && !typing(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (typing(e.target)) return;

      const step = e.shiftKey ? 1 : LAYOUT_SNAP;
      const nudge = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }[e.key];

      if (nudge && selected) {
        e.preventDefault();
        const to = clampToMaxRoom(selected.x + nudge[0], selected.y + nudge[1]);
        onMove(selected.id, to.x, to.y);
        return;
      }

      if (e.key === "Escape") {
        if (pending) setPending(null);
        else if (tool !== "select") setTool("select");
        else setSelectedId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected && !selected.occupant) {
        e.preventDefault();
        onDelete(selected.id);
        setSelectedId(null);
      } else if (e.key === "v") setTool("select");
      else if (e.key === "a") setTool("add");
      else if (e.key === "0") fitToRoom();
      else if (e.key === "1") setView({ zoom: 1, panX: pan.x, panY: pan.y });
      else if (e.key === "=" || e.key === "+") zoomAround(1.25);
      else if (e.key === "-") zoomAround(1 / 1.25);
    };

    const onKeyUp = (e) => {
      if (e.code === "Space") setSpaceHeld(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selected, pending, tool, onMove, onDelete, fitToRoom, zoomAround, setView, pan.x, pan.y]);

  const taken = desks.filter((d) => d.occupant).length;
  const showLabels = zoom >= LABEL_ZOOM;
  const cursorClass = panning
    ? "cursor-grabbing"
    : spaceHeld
      ? "cursor-grab"
      : tool === "add"
        ? "cursor-crosshair"
        : "cursor-default";

  // Desk plate drawn at its true size in the world
  const plate = { w: DESK_UNITS.width * PX, h: DESK_UNITS.height * PX };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink text-paper">
      {/* Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/60 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)]">
        <h1 className="font-display text-base font-extrabold tracking-tight">Office layout</h1>

        <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
          <ToolButton
            active={tool === "select"}
            onClick={() => setTool("select")}
            title="Select and move — V"
          >
            <MousePointer2 size={15} />
          </ToolButton>
          <ToolButton active={tool === "add"} onClick={() => setTool("add")} title="Add a desk — A">
            <Plus size={15} />
          </ToolButton>
        </div>

        <p className="code hidden text-[11px] text-muted sm:block">
          {desks.length} desks · {taken} seated · {span.w} × {span.h} units
        </p>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomAround(1 / 1.25)}
            title="Zoom out — minus"
            className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={fitToRoom}
            title="Fit the office — 0"
            className="code hidden min-w-14 rounded-md border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-paper/40 hover:text-paper sm:block"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomAround(1.25)}
            title="Zoom in — plus"
            className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={fitToRoom}
            title="Fit the office — 0"
            className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <Maximize2 size={14} />
          </button>

          <div className="mx-2 h-6 w-px bg-line" />

          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-red-400/60 hover:text-red-300"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-md bg-pick px-4 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-pick/85"
          >
            <Check size={14} />
            Done
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desk list */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line/60 lg:flex">
          <p className="code border-b border-line/60 px-3 py-2 text-[10px] uppercase text-muted">
            Desks · {desks.length}
          </p>
          <ul className="flex-1 overflow-y-auto py-1">
            {[...desks]
              .sort((a, b) => b.y - a.y || a.x - b.x)
              .map((desk) => (
                <li key={desk.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(desk.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      desk.id === selectedId ? "bg-pick/15" : "hover:bg-plate/60"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-sm ${
                        desk.occupant ? "bg-lit" : "bg-line"
                      }`}
                    />
                    <span
                      className={`code text-[11px] ${
                        desk.id === selectedId ? "text-pick" : "text-paper/80"
                      }`}
                    >
                      {desk.id}
                    </span>
                    <span className="ml-auto truncate text-[11px] text-muted">
                      {desk.occupant ?? ""}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onClick={onCanvasClick}
          className={`grab-surface relative min-w-0 flex-1 overflow-hidden ${cursorClass}`}
          style={CANVAS_BACKDROP}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transformOrigin: "0 0",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {/* The room, drawn as a frame on the canvas */}
            <RoomFrame room={shown} zoom={zoom} label={`Office · ${span.w} × ${span.h}`}>
              {/* Hangs on the back wall and moves with it, so there is
                  nothing to drag — but leaving it off the plan would hide
                  why that stretch of wall should stay clear */}
              <BoardPlate room={shown} zoom={zoom} />
              {/* Wall handles */}
              {[
                ["top", "left-0 right-0 -top-1 h-2 cursor-ns-resize"],
                ["bottom", "left-0 right-0 -bottom-1 h-2 cursor-ns-resize"],
                ["left", "top-0 bottom-0 -left-1 w-2 cursor-ew-resize"],
                ["right", "top-0 bottom-0 -right-1 w-2 cursor-ew-resize"],
              ].map(([side, position]) => (
                <div
                  key={side}
                  data-wall=""
                  onPointerDown={(e) => startWallDrag(e, side)}
                  title={`Drag to move the ${side} wall`}
                  className={`absolute z-20 transition-colors hover:bg-pick ${position} ${
                    wallDrag?.side === side ? "bg-pick" : "bg-pick/30"
                  }`}
                >
                  <TouchPad zoom={zoom} pad={14} />
                </div>
              ))}

              {/* Alignment guides */}
              {drag?.guideX != null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 z-30 border-l border-dashed border-lit"
                  style={{ left: (drag.guideX - shown.minX) * PX }}
                />
              )}
              {drag?.guideY != null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 z-30 border-t border-dashed border-lit"
                  style={{ top: (shown.maxY - drag.guideY) * PX }}
                />
              )}

              {desks.map((desk) => {
                const dragging = drag?.id === desk.id;
                const live = dragging && drag.kind === "desk" ? drag : desk;
                const isSelected = desk.id === selectedId;
                const taken2 = Boolean(desk.occupant);
                const receiving = dropTarget === desk.id && drag?.kind === "person";
                const swapping = receiving && taken2;

                return (
                  <div
                    key={desk.id}
                    data-desk={desk.id}
                    style={{
                      left: (live.x - shown.minX) * PX,
                      top: (shown.maxY - live.y) * PX,
                      width: plate.w,
                      height: plate.h,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                      dragging ? "z-30" : isSelected ? "z-20" : "z-10"
                    }`}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => startDeskDrag(e, desk, "desk")}
                      onClick={() => setSelectedId(desk.id)}
                      className={`relative flex h-full w-full flex-col items-center justify-center rounded-sm border outline-none ${
                        dragging ? "cursor-grabbing" : "cursor-grab"
                      } ${deskTone({
                        selected: isSelected,
                        taken: taken2,
                        receiving,
                        swapping,
                      })}`}
                    >
                      <TouchPad zoom={zoom} />
                      {showLabels && (
                        <span
                          className={`code text-[9px] leading-none font-bold ${
                            isSelected ? "text-pick" : taken2 ? "text-lit" : "text-muted"
                          }`}
                        >
                          {desk.id}
                        </span>
                      )}
                    </button>

                    {/* The nameplate sits in front of the desk, where the
                        person stands, and is its own drag handle */}
                    {taken2 && showLabels && (
                      <span
                        onPointerDown={(e) => startDeskDrag(e, desk, "person")}
                        title={`Drag ${desk.occupant} to another desk`}
                        className="absolute left-1/2 top-full max-w-24 -translate-x-1/2 translate-y-0.5 cursor-grab truncate rounded bg-lit/20 px-1 text-[9px] leading-tight text-paper/90 hover:bg-lit/40"
                      >
                        {desk.occupant}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Ghost following a person being reseated */}
              {drag?.kind === "person" && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded bg-lit px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-ink shadow-lg"
                  style={{
                    left: (drag.x - shown.minX) * PX,
                    top: (shown.maxY - drag.y) * PX,
                  }}
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
                <div
                  data-editor=""
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    left: (pending.x - shown.minX) * PX,
                    top: (shown.maxY - pending.y) * PX,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  }}
                  className="absolute z-40 flex items-center gap-1 rounded-md border border-pick bg-ink p-1 shadow-xl"
                >
                  <input
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setPending(null);
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (code.trim()) {
                          onAdd(code.trim(), pending.x, pending.y);
                          setPending(null);
                        }
                      }
                    }}
                    placeholder="TB-000"
                    maxLength={20}
                    className="code w-20 bg-transparent px-1 text-[11px] text-paper placeholder-muted/60 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!code.trim()) return;
                      onAdd(code.trim(), pending.x, pending.y);
                      setPending(null);
                    }}
                    className="rounded bg-pick px-2 py-0.5 text-[11px] font-bold text-ink hover:bg-pick/85"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    title="Cancel"
                    className="rounded p-0.5 text-muted hover:text-paper"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </RoomFrame>
          </div>

          {tool === "add" && !pending && (
            <p className="code pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-plate/90 px-3 py-1.5 text-[11px] text-paper shadow-lg">
              Click anywhere to place a desk · Esc to cancel
            </p>
          )}

          {problem && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-red-400/40 bg-red-950/90 px-4 py-2.5 text-sm text-red-100 shadow-xl">
              {problem}
              <button
                type="button"
                onClick={onDismissProblem}
                className="text-red-300 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Inspector */}
        <aside className="hidden w-64 shrink-0 flex-col border-l border-line/60 lg:flex">
          {selected ? (
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="code text-[10px] uppercase text-muted">Desk</p>
                <p className="code mt-1 text-lg font-bold text-pick">{selected.id}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="X"
                  value={selected.x}
                  onCommit={(x) => onMove(selected.id, clampToMaxRoom(x, selected.y).x, selected.y)}
                />
                <NumberField
                  label="Y"
                  value={selected.y}
                  onCommit={(y) => onMove(selected.id, selected.x, clampToMaxRoom(selected.x, y).y)}
                />
              </div>

              <div>
                <p className="code text-[10px] uppercase text-muted">Seat</p>
                {selected.occupant ? (
                  <p className="mt-1 flex items-center gap-2 text-sm text-paper">
                    <User size={14} className="text-lit" />
                    {selected.occupant}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">Open</p>
                )}
              </div>

              <button
                type="button"
                disabled={Boolean(selected.occupant)}
                onClick={() => {
                  onDelete(selected.id);
                  setSelectedId(null);
                }}
                title={
                  selected.occupant ? "Move whoever sits here first" : `Remove ${selected.id}`
                }
                className="flex items-center justify-center gap-2 rounded-md border border-line py-2 text-sm text-muted transition-colors hover:border-red-400/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={14} />
                Remove desk
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="code text-[10px] uppercase text-muted">Office</p>
                <p className="mt-1 text-sm text-muted">
                  Nothing selected. Pick a desk to inspect it.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Width"
                  value={span.w}
                  step={2}
                  onCommit={(w) => onResizeRoom({ ...room, maxX: room.minX + Math.max(MIN_SPAN, w) })}
                />
                <NumberField
                  label="Height"
                  value={span.h}
                  step={2}
                  onCommit={(h) => onResizeRoom({ ...room, maxY: room.minY + Math.max(MIN_SPAN, h) })}
                />
              </div>
              <p className="text-xs text-muted/80">
                Or drag any wall on the canvas. Walls also move outward on their own when a desk
                is pushed against them.
              </p>
            </div>
          )}

          <div className="mt-auto border-t border-line/60 p-4">
            <p className="code text-[10px] uppercase text-muted">Shortcuts</p>
            <dl className="mt-2 space-y-1 text-[11px] text-muted">
              <Shortcut keys="V / A">Select · Add desk</Shortcut>
              <Shortcut keys="Space + drag">Pan</Shortcut>
              <Shortcut keys="Scroll">Zoom</Shortcut>
              <Shortcut keys="0 / 1">Fit · 100%</Shortcut>
              <Shortcut keys="Arrows">Nudge (Shift: 1 unit)</Shortcut>
              <Shortcut keys="Delete">Remove desk</Shortcut>
            </dl>
          </div>
        </aside>
      </div>

      {/* Status bar */}
      <footer className="code flex shrink-0 items-center gap-4 border-t border-line/60 px-4 py-1.5 text-[10px] text-muted">
        <span>
          x {cursor.x} · y {cursor.y}
        </span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>
          room {span.w} × {span.h}
        </span>
        {selected && <span className="text-pick">{selected.id} selected</span>}
        <span className="ml-auto">snap {LAYOUT_SNAP}</span>
      </footer>
    </div>
  );
}

function ToolButton({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded p-1.5 transition-colors ${
        active ? "bg-pick text-ink" : "text-muted hover:bg-plate hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}

/** A numeric field that commits on Enter or blur, not on every keystroke. */
function NumberField({ label, value, onCommit, step = 0.5 }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    else setDraft(String(value));
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="code text-[10px] uppercase text-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        className="code rounded-md border border-line bg-ink px-2 py-1.5 text-sm text-paper outline-none transition-colors focus:border-pick"
      />
    </label>
  );
}

function Shortcut({ keys, children }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-paper/70">{keys}</dt>
      <dd className="text-right text-muted/80">{children}</dd>
    </div>
  );
}
