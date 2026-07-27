import { useEffect, useState } from "react";

/**
 * Tracks who the player is currently standing next to (the character the
 * speech-bubble indicator points at) and turns a click on that bubble — or
 * the E key — into an "open the chat" request.
 */
export function useInteraction(world, onInteract) {
  const [nearbyId, setNearbyId] = useState(null);

  useEffect(() => {
    world.onNearbyChange = setNearbyId;
    return () => {
      world.onNearbyChange = null;
    };
  }, [world]);

  useEffect(() => {
    const canvas = world.renderer.domElement;

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (world.indicatorHit(ndcX, ndcY) && world.nearbyId !== null) {
        onInteract(world.nearbyId);
      }
    };

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() !== "e") return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (world.nearbyId !== null) onInteract(world.nearbyId);
    };

    canvas.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [world, onInteract]);

  return nearbyId;
}
