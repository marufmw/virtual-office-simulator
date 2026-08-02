import { useEffect, useState } from "react";

/**
 * Whether this is a device driven by a finger rather than a mouse, which
 * decides whether the on-screen controls are shown at all. A laptop with a
 * touchscreen reports both; `pointer: coarse` asks the narrower question of
 * what the *primary* pointer is, so those keep the keyboard controls.
 *
 * Watched rather than read once: a tablet with a keyboard folio changes its
 * answer when the keyboard is attached.
 */
export function useIsTouch() {
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = (e) => setIsTouch(e.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isTouch;
}
