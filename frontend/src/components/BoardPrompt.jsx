import { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";

/**
 * The invitation to draw, pinned to the whiteboard rather than parked at the
 * bottom of the screen — it belongs to the thing it's about, and follows it
 * as the camera moves.
 *
 * Position is read from the world each frame rather than held in state: the
 * camera glides after the player, and a prompt that updates on a React
 * render would visibly lag behind the board it is stuck to.
 */
export function BoardPrompt({ world, count, onOpen }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let frame = 0;

    const follow = () => {
      const node = ref.current;
      if (node) {
        const board = world.boardPosition();
        const { left, top } = world.worldToScreen(board.x, board.y);
        node.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`;
        if (!ready) setReady(true);
      }
      frame = requestAnimationFrame(follow);
    };

    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [world, ready]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      className="absolute left-0 top-0 z-20 flex items-center gap-2 whitespace-nowrap rounded-full border border-pick/70 bg-pick px-4 py-2 font-display text-sm font-bold text-ink shadow-xl transition-transform hover:scale-105"
      style={{ opacity: ready ? 1 : 0 }}
    >
      <PenLine size={15} />
      Take part
      {count > 1 && <span className="font-normal opacity-70">· {count} here</span>}
    </button>
  );
}
