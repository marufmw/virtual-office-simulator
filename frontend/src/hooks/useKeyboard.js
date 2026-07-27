import { useEffect, useRef } from "react";

/**
 * Tracks which keys are currently held down.
 * Returns a ref containing a Set of lowercase key names.
 */
export function useKeyboard() {
  const keysRef = useRef(new Set());

  useEffect(() => {
    const keys = keysRef.current;
    // Typing in the chat box must not walk the character around
    const isTyping = (e) => e.target instanceof HTMLElement && e.target.closest("input, textarea");
    const onKeyDown = (e) => {
      if (isTyping(e)) return;
      keys.add(e.key.toLowerCase());
    };
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
