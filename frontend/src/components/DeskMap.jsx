import { useState } from "react";
import { User } from "lucide-react";
import { PX, CANVAS_BACKDROP, deskTone, useCanvasView } from "./canvas/officeView";
import { RoomFrame, ZoomControls } from "./canvas/officeCanvas";
import { DESK_UNITS } from "../game/deskSize";

const LABEL_ZOOM = 0.45; // below this, plates are too small for text

/**
 * The desk picker: the office floor plan, drawn on the same canvas as the
 * layout editor but read-only. Desks sit where they actually sit in the
 * world and are drawn to their real size, so choosing a seat means choosing
 * a place in the room rather than a code from a list.
 */
export function DeskMap({ desks, room, value, onChange }) {
  const { canvasRef, zoom, pan, setView, fit, zoomAround } = useCanvasView(room);
  const [panning, setPanning] = useState(null);
  const [hovered, setHovered] = useState(null);

  const span = { w: room.maxX - room.minX, h: room.maxY - room.minY };
  const plate = { w: DESK_UNITS.width * PX, h: DESK_UNITS.height * PX };
  const showLabels = zoom >= LABEL_ZOOM;

  function onPointerDown(e) {
    if (e.target.closest("[data-desk]")) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function onPointerMove(e) {
    if (!panning) return;
    setView({ zoom, panX: e.clientX - panning.x, panY: e.clientY - panning.y });
  }

  return (
    <div
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setPanning(null)}
      onPointerCancel={() => setPanning(null)}
      onWheel={(e) => {
        e.preventDefault();
        zoomAround(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
      }}
      className={`relative h-full w-full overflow-hidden ${
        panning ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={CANVAS_BACKDROP}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transformOrigin: "0 0",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <RoomFrame room={room} zoom={zoom} label={`Office · ${span.w} × ${span.h}`}>
          {desks.map((desk) => {
            const selected = desk.id === value;
            const taken = Boolean(desk.occupant);

            return (
              <div
                key={desk.id}
                data-desk={desk.id}
                style={{
                  left: (desk.x - room.minX) * PX,
                  top: (room.maxY - desk.y) * PX,
                  width: plate.w,
                  height: plate.h,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                  selected ? "z-20" : "z-10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange(desk.id)}
                  onPointerEnter={() => setHovered(desk.id)}
                  onPointerLeave={() => setHovered((h) => (h === desk.id ? null : h))}
                  aria-pressed={selected}
                  aria-label={
                    taken ? `Desk ${desk.id}, ${desk.occupant} sits here` : `Desk ${desk.id}, open`
                  }
                  className={`flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-sm border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pick ${deskTone(
                    { selected, taken, hoverable: true }
                  )}`}
                >
                  {showLabels && (
                    <span
                      className={`code text-[9px] leading-none font-bold ${
                        selected ? "text-pick" : taken ? "text-lit" : "text-muted"
                      }`}
                    >
                      {desk.id}
                    </span>
                  )}
                </button>

                {/* The nameplate sits in front of the desk, where the
                    person actually stands */}
                {showLabels && (
                  <span
                    className={`pointer-events-none absolute left-1/2 top-full max-w-24 -translate-x-1/2 translate-y-0.5 truncate rounded px-1 text-[9px] leading-tight ${
                      taken
                        ? "bg-lit/20 text-paper/90"
                        : selected
                          ? "bg-pick/20 text-pick"
                          : "text-muted/50"
                    }`}
                  >
                    {desk.occupant ?? (selected ? "yours" : "open")}
                  </span>
                )}

                {/* Who's here, when you hover a taken desk */}
                {hovered === desk.id && taken && (
                  <span
                    className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 flex origin-bottom -translate-x-1/2 items-center gap-1 rounded bg-plate px-2 py-1 text-[10px] whitespace-nowrap text-paper shadow-lg"
                    style={{ transform: `translateX(-50%) scale(${1 / zoom})` }}
                  >
                    <User size={10} className="text-lit" />
                    {desk.occupant} sits here
                  </span>
                )}
              </div>
            );
          })}
        </RoomFrame>
      </div>

      {/* Legend and zoom, floated over the canvas like the editor's */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-4 rounded-md border border-line bg-ink/90 px-3 py-2 text-[11px] text-muted shadow-lg backdrop-blur">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm border border-lit/50 bg-lit/20" />
            Taken
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm border border-line bg-plate" />
            Open
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm border border-pick bg-pick/25" />
            Your desk
          </span>
        </div>

        <div className="pointer-events-auto">
          <ZoomControls
            zoom={zoom}
            onFit={fit}
            onZoomIn={() => zoomAround(1.25)}
            onZoomOut={() => zoomAround(1 / 1.25)}
          />
        </div>
      </div>
    </div>
  );
}
