import { useEffect, useRef, useState } from "react";
import { X, Crosshair, Users, MapPin } from "lucide-react";
import { PX, useCanvasView, usePinchZoom, useWheelZoom } from "./canvas/officeView";
import { RoomFrame, ZoomControls, BoardPlate } from "./canvas/officeCanvas";
import { DESK_UNITS } from "../game/deskSize";
import { boardStandPosition } from "../game/boardPlacement";

const REFRESH_MS = 120; // how often the markers re-read the world
const GLIDE_MS = 200; // and how long they take to slide to the new spot
const TAP_SLOP = 10; // px of drag still counted as a tap
const STAND_OFFSET = 1.3; // walk to just in front of someone, not into them
const LABEL_ZOOM = 0.5; // below this, desk codes are noise

/**
 * The map screen: the whole office at a glance, with everyone on it moving
 * in something close to real time, and a tap anywhere to walk there.
 *
 * The plan is drawn in the DOM rather than sharing the 3D scene — it reads
 * `world.deskList()` and `world.playerList()`, which are plain numbers. The
 * room scales with the zoom because it is a place; markers counter-scale so
 * they stay a readable size however far out you are, the way a map's pins
 * do rather than its streets.
 */
export function OfficeMap({ world, onWalkTo, onClose }) {
  const room = world.room;
  const { canvasRef, zoom, pan, setView, fit, toWorld, zoomAround } = useCanvasView(room);
  const pinch = usePinchZoom({ zoom, zoomAround });
  useWheelZoom(canvasRef, zoomAround);

  const [desks] = useState(() => world.deskList());
  const [people, setPeople] = useState(() => world.playerList());
  const [panning, setPanning] = useState(null);
  const [ping, setPing] = useState(null); // { x, y, key } where you last tapped
  const [hovered, setHovered] = useState(null);
  const pressRef = useRef(null);

  // The world moves outside React, so the markers pull rather than are
  // pushed. A few times a second is plenty for a map.
  useEffect(() => {
    const timer = setInterval(() => setPeople(world.playerList()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [world]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const me = people.find((p) => p.id === world.myId) ?? null;
  const others = people.filter((p) => p.id !== world.myId);
  const plate = { w: DESK_UNITS.width * PX, h: DESK_UNITS.height * PX };
  const showLabels = zoom >= LABEL_ZOOM;

  // World coordinates -> pixels inside the room frame
  const at = (x, y) => `translate(${(x - room.minX) * PX}px, ${(room.maxY - y) * PX}px)`;
  const distanceTo = (p) => (me ? Math.hypot(p.x - me.x, p.y - me.y) : null);

  function walk(x, y) {
    setPing({ x, y, key: Date.now() });
    onWalkTo({ x, y });
    // Long enough to see where the walk was sent before the map gets out
    // of the way of watching it happen
    setTimeout(onClose, 260);
  }

  function onPointerDown(e) {
    pinch.onPointerDown(e);
    if (pinch.pinching) return setPanning(null);
    pressRef.current = { x: e.clientX, y: e.clientY };
    canvasRef.current.setPointerCapture(e.pointerId);
    setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function onPointerMove(e) {
    pinch.onPointerMove(e);
    if (!panning || pinch.pinching) return;
    setView({ zoom, panX: e.clientX - panning.x, panY: e.clientY - panning.y });
  }

  function onPointerUp(e) {
    pinch.onPointerUp(e);
    setPanning(null);

    const press = pressRef.current;
    pressRef.current = null;
    if (!press || pinch.pinching) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) return;
    // Desks and people are their own targets, handled on the marker itself
    if (e.target.closest("[data-target]")) return;

    const spot = toWorld(e.clientX, e.clientY);
    if (world.collidesAt(spot.x, spot.y, world.myId)) return;
    walk(spot.x, spot.y);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink/90 backdrop-blur-md">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/50 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <MapPin size={18} className="shrink-0 text-pick" />
        <div className="min-w-0">
          <h1 className="font-display text-base font-extrabold leading-none tracking-tight text-paper">
            Office map
          </h1>
          <p className="code mt-1 text-[10px] uppercase tracking-wider text-muted">
            {people.length} here · {desks.length} desks
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-paper/40 hover:text-paper"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`grab-surface relative h-[56dvh] shrink-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1 ${
            panning ? "cursor-grabbing" : "cursor-crosshair"
          }`}
          style={{
            // A pool of light over the office, falling away to nothing at
            // the edges, so the room reads as the lit thing on the screen
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(56,189,248,0.10), transparent 62%), radial-gradient(#454d68 1px, transparent 1px)",
            backgroundSize: "100% 100%, 22px 22px",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transformOrigin: "0 0",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <RoomFrame room={room} zoom={zoom}>
              {/* The whiteboard, and a way to walk over to it */}
              <BoardPlate
                room={room}
                zoom={zoom}
                hint="Walk to the whiteboard"
                onClick={() => {
                  const spot = boardStandPosition(room);
                  walk(spot.x, spot.y);
                }}
              />

              {/* Desks: part of the room, so they scale with it */}
              {desks.map((desk) => {
                const seated = others.some(
                  (p) => Math.abs(p.x - desk.x) < 1.6 && Math.abs(p.y - desk.y) < 2.4
                );
                return (
                  <button
                    key={desk.id}
                    type="button"
                    data-target=""
                    onClick={() => walk(desk.x, desk.y - STAND_OFFSET)}
                    onPointerEnter={() => setHovered(`desk:${desk.id}`)}
                    onPointerLeave={() => setHovered(null)}
                    aria-label={`Walk to desk ${desk.id}`}
                    className={`absolute flex items-center justify-center rounded-[3px] border transition-colors ${
                      seated
                        ? "border-lit/60 bg-lit/20 hover:bg-lit/35"
                        : "border-line/80 bg-plate/70 hover:border-paper/50 hover:bg-plate"
                    }`}
                    style={{
                      width: plate.w,
                      height: plate.h,
                      transform: `${at(desk.x, desk.y)} translate(-50%, -50%)`,
                    }}
                  >
                    {showLabels && (
                      <span
                        className={`code text-[8px] leading-none font-bold ${
                          seated ? "text-lit/90" : "text-muted/70"
                        }`}
                      >
                        {desk.id}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Where you tapped */}
              {ping && (
                <span
                  key={ping.key}
                  aria-hidden="true"
                  className="pointer-events-none absolute"
                  style={{ transform: at(ping.x, ping.y) }}
                >
                  <span
                    className="map-ping absolute block h-10 w-10 rounded-full border-2 border-pick"
                    style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                  />
                </span>
              )}

              {/* Everyone else */}
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-target=""
                  onClick={() => walk(p.x, p.y - STAND_OFFSET)}
                  onPointerEnter={() => setHovered(`player:${p.id}`)}
                  onPointerLeave={() => setHovered(null)}
                  aria-label={`Walk to ${p.name ?? "someone"}`}
                  className="absolute z-20"
                  style={{ transform: at(p.x, p.y), transition: `transform ${GLIDE_MS}ms linear` }}
                >
                  <span
                    className="absolute flex flex-col items-center"
                    style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                  >
                    <span className="map-blip block h-3.5 w-3.5 rounded-full border-2 border-ink bg-lit shadow-[0_0_12px_rgba(245,181,68,0.7)]" />
                    {(showLabels || hovered === `player:${p.id}`) && (
                      <span className="mt-1 whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold text-paper shadow">
                        {p.name ?? "Someone"}
                      </span>
                    )}
                  </span>
                </button>
              ))}

              {/* You */}
              {me && (
                <span
                  className="pointer-events-none absolute z-30"
                  style={{ transform: at(me.x, me.y), transition: `transform ${GLIDE_MS}ms linear` }}
                >
                  <span
                    className="absolute flex flex-col items-center"
                    style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                  >
                    <span className="map-pulse absolute block h-5 w-5 rounded-full bg-pick" />
                    <span className="relative block h-4 w-4 rounded-full border-2 border-ink bg-pick shadow-[0_0_16px_rgba(56,189,248,0.9)]" />
                    <span className="relative mt-1 whitespace-nowrap rounded bg-pick px-1.5 py-0.5 text-[10px] font-bold text-ink shadow">
                      You
                    </span>
                  </span>
                </span>
              )}
            </RoomFrame>
          </div>

          {/* Floating controls, clear of the plan itself */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
            <p className="pointer-events-none hidden rounded-md border border-line/70 bg-ink/85 px-3 py-2 text-[11px] text-muted shadow-lg backdrop-blur sm:block">
              Tap anywhere to walk there
            </p>
            <div className="pointer-events-auto ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={fit}
                aria-label="Centre the office"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-ink/90 text-muted shadow-lg backdrop-blur transition-colors hover:border-paper/40 hover:text-paper"
              >
                <Crosshair size={16} />
              </button>
              <ZoomControls
                zoom={zoom}
                onFit={fit}
                onZoomIn={() => zoomAround(1.25)}
                onZoomOut={() => zoomAround(1 / 1.25)}
              />
            </div>
          </div>
        </div>

        {/* Who's here. A rail beside the plan with room, a strip under it
            without — either way, a name is a place you can walk to. */}
        <aside className="flex min-h-0 flex-1 flex-col border-t border-line/50 lg:w-64 lg:flex-none lg:border-l lg:border-t-0">
          <p className="code shrink-0 px-4 pt-4 text-[10px] uppercase tracking-wider text-muted">
            <Users size={11} className="mr-1.5 inline align-[-1px]" />
            In the office
          </p>

          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
            {others.length === 0 && (
              <li className="px-1 py-2 text-xs text-muted">Nobody else is in right now.</li>
            )}
            {others.map((p) => {
              const away = distanceTo(p);
              return (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => walk(p.x, p.y - STAND_OFFSET)}
                    onPointerEnter={() => setHovered(`player:${p.id}`)}
                    onPointerLeave={() => setHovered(null)}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                      hovered === `player:${p.id}`
                        ? "border-pick/60 bg-pick/10"
                        : "border-line/60 bg-room/70 hover:border-line"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-lit shadow-[0_0_8px_rgba(245,181,68,0.7)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-paper">
                        {p.name ?? "Someone"}
                      </span>
                      {away !== null && (
                        <span className="code block text-[10px] text-muted">
                          {away < 2.5 ? "right here" : `${Math.round(away)} steps away`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
