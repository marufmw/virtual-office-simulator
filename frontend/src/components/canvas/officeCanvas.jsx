import { PX } from "./officeView";

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
