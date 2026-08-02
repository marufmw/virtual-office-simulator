import { useCallback, useRef, useState } from "react";
import { MessageCircle, Armchair } from "lucide-react";

const STICK_RADIUS = 52; // how far the thumb can push, in screen pixels
const DEAD_ZONE = 0.14; // below this the stick reads as centred

/**
 * The thumb stick. Writes straight into `stickRef` — a plain `{ x, y }` the
 * game loop reads each frame — rather than into React state, so walking
 * doesn't re-render the office sixty times a second.
 *
 * The base stays put and the knob moves within it; anything past the edge
 * is clamped to full stretch, so a thumb that slides off the control keeps
 * walking in that direction instead of stopping dead.
 */
function Stick({ stickRef }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const update = useCallback(
    (e) => {
      const rect = baseRef.current.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      const reach = Math.min(distance, STICK_RADIUS);
      const angle = Math.atan2(dy, dx);

      const knobX = Math.cos(angle) * reach;
      const knobY = Math.sin(angle) * reach;
      setKnob({ x: knobX, y: knobY });

      const pull = reach / STICK_RADIUS;
      // Screen y grows downward, the office's y grows north
      stickRef.current =
        pull < DEAD_ZONE ? { x: 0, y: 0 } : { x: (knobX / reach) * pull, y: -(knobY / reach) * pull };
    },
    [stickRef]
  );

  const release = useCallback(() => {
    setActive(false);
    setKnob({ x: 0, y: 0 });
    stickRef.current = { x: 0, y: 0 };
  }, [stickRef]);

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        update(e);
      }}
      onPointerMove={(e) => active && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Walk"
      className="grab-surface relative h-32 w-32 rounded-full border border-line/70 bg-ink/45 backdrop-blur-sm transition-opacity"
      style={{ opacity: active ? 1 : 0.65 }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-paper/25 bg-paper/20 shadow-lg"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          transition: active ? "none" : "transform 120ms ease-out",
        }}
      />
    </div>
  );
}

/**
 * Everything the keyboard does, put within reach of a thumb: the stick on
 * the left, and on the right the two things E and right-click do — talk to
 * whoever you're standing next to, and walk back to your own desk.
 *
 * Shown only on touch devices; a keyboard already has all of this.
 */
export function TouchControls({ stickRef, canInteract, interactLabel, onInteract, onGoToDesk }) {
  return (
    <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-5 pb-5">
      <div className="pointer-events-auto">
        <Stick stickRef={stickRef} />
      </div>

      <div className="pointer-events-auto flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={onGoToDesk}
          title="Go to my desk"
          aria-label="Go to my desk"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line/70 bg-ink/70 text-muted shadow-lg backdrop-blur-sm active:bg-plate"
        >
          <Armchair size={20} />
        </button>
        <button
          type="button"
          onClick={onInteract}
          disabled={!canInteract}
          title={interactLabel}
          aria-label={interactLabel}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-pick/60 bg-pick/90 text-ink shadow-xl transition-opacity active:bg-pick disabled:pointer-events-none disabled:opacity-0"
        >
          <MessageCircle size={26} />
        </button>
      </div>
    </div>
  );
}
