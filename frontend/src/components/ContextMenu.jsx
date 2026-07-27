import { useEffect, useState } from "react";

/**
 * Custom right-click context menu for the office canvas.
 * Currently supports: Go to desk.
 */
export function ContextMenu({ onGoToDesk }) {
  const [menu, setMenu] = useState(null); // { x, y } screen position

  useEffect(() => {
    const onContextMenu = (e) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    };
    const close = () => setMenu(null);

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  if (!menu) return null;

  return (
    <div
      className="fixed z-20 min-w-36 overflow-hidden rounded-md border border-slate-600 bg-slate-800 py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="block w-full px-4 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-700"
        onClick={() => {
          onGoToDesk();
          setMenu(null);
        }}
      >
        Go to desk
      </button>
    </div>
  );
}
