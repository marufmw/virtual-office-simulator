import { useEffect, useRef } from "react";

/**
 * Tracks which keys are currently held down.
 * Returns a ref containing a Set of lowercase key names.
 */
export function useKeyboard() {
  const keysRef = useRef(new Set());

  useEffect(() => {
    const keys = keysRef.current;
    const onKeyDown = (e) => keys.add(e.key.toLowerCase());
    const onKeyUp = (e) => keys.delete(e.key.toLowerCase());

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      keys.clear();
    };
  }, []);

  return keysRef;
}
