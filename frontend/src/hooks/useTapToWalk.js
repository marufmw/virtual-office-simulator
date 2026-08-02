import { useEffect } from "react";

const TAP_SLOP = 12; // px of movement still counted as a tap, not a drag
const TAP_TIME = 500; // ms beyond which it's a press, not a tap

/**
 * Tapping a spot on the floor walks there, routed around the furniture by
 * the same pathfinder the "go to desk" menu uses.
 *
 * Only for touch: with a keyboard, walking is WASD and a stray click
 * shouldn't send anyone across the room. A tap that lands on the chat
 * bubble is left alone — that one opens a conversation.
 */
export function useTapToWalk(world, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const canvas = world.renderer.domElement;
    let start = null;

    const onPointerDown = (e) => {
      if (e.pointerType === "mouse") return;
      start = { x: e.clientX, y: e.clientY, at: performance.now() };
    };

    const onPointerUp = (e) => {
      if (!start) return;
      const travelled = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const elapsed = performance.now() - start.at;
      start = null;
      if (travelled > TAP_SLOP || elapsed > TAP_TIME) return;

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // The bubble is a tap target of its own
      if (world.indicatorHit(ndcX, ndcY)) return;

      const goal = world.screenToWorld(ndcX, ndcY);
      // Walking into a desk or a wall isn't a destination; the nearest the
      // pathfinder can get would be a surprise, so ignore it instead
      if (world.collidesAt(goal.x, goal.y, world.myId)) return;
      world.walkTo(goal);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", () => (start = null));
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [world, enabled]);
}
