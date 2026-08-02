import { PX } from "./officeView";
import { BOARD_WIDTH, boardPosition } from "../../game/boardPlacement";

/**
 * The room drawn as a frame on the canvas: floor, tiles and a label that
 * stays legible at any zoom. Interactive extras go in as children.
 */
export function RoomFrame({ room, zoom, label, children }) {
  const span = { w: room.maxX - room.minX, h: room.maxY - room.minY };

  return (
    <div
      className="absolute border-2 border-line bg-room shadow-2xl shadow-black/50"
      style={{
        left: room.minX * PX,
        top: -room.maxY * PX,
        width: span.w * PX,
        height: span.h * PX,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: `${2 * PX}px ${2 * PX}px`,
        }}
      />
      {label && (
        <span
          className="code pointer-events-none absolute -top-1 left-0 origin-bottom-left text-[11px] whitespace-nowrap text-muted"
          style={{ transform: `scale(${1 / zoom}) translateY(-4px)` }}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * The whiteboard, drawn where it hangs: centred on the back wall, straddling
 * it the way it does in the office. Every plan view shows it, because a
 * floor plan that leaves out the one thing on the wall you can walk up to
 * and use is a floor plan that misleads you.
 *
 * With an `onClick` it becomes a way to go there; without one it's a
 * landmark, which is all the desk picker and the layout editor need — the
 * board's position follows the walls and isn't anyone's to drag.
 */
export function BoardPlate({ room, zoom, onClick, hint }) {
  const position = boardPosition(room);
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      {...(interactive
        ? { type: "button", onClick, "data-target": "", "aria-label": hint ?? "Go to the whiteboard" }
        : { "aria-hidden": "true" })}
      className={`absolute z-20 flex items-center justify-center rounded-sm border-2 border-slate-300/70 bg-slate-100 shadow-[0_0_10px_rgba(226,232,240,0.35)] ${
        interactive ? "transition-colors hover:border-pick hover:bg-white" : ""
      }`}
      style={{
        width: BOARD_WIDTH * PX,
        height: 0.9 * PX,
        left: (position.x - room.minX) * PX,
        top: (room.maxY - position.y) * PX,
        transform: "translate(-50%, -50%)",
      }}
    >
      {interactive && <TouchPad zoom={zoom} />}
      <span
        className="code pointer-events-none whitespace-nowrap text-[8px] font-bold leading-none text-slate-600"
        style={{ transform: `scale(${Math.min(1, 1 / zoom)})` }}
      >
        WHITEBOARD
      </span>
    </Tag>
  );
}

/**
 * An invisible margin that keeps a small target reachable by thumb. Plan
 * views draw desks at their true size inside a scaled container, so zoomed
 * out to fit the whole office a desk plate is only a few pixels across and
 * a wall handle thinner still. Dividing by the zoom cancels that scaling,
 * leaving a constant pad in screen pixels however far out the view is.
 */
export function TouchPad({ zoom, pad = 11 }) {
  return <span aria-hidden="true" className="absolute" style={{ inset: -pad / zoom }} />;
}

/** The zoom cluster shared by both plan views. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onFit }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-ink/90 p-1 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        className="rounded px-2 py-1 text-muted transition-colors hover:bg-plate hover:text-paper"
      >
        −
      </button>
      <button
        type="button"
        onClick={onFit}
        title="Fit the office"
        className="code min-w-12 rounded px-1 py-1 text-[11px] text-muted transition-colors hover:bg-plate hover:text-paper"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        className="rounded px-2 py-1 text-muted transition-colors hover:bg-plate hover:text-paper"
      >
        +
      </button>
    </div>
  );
}
