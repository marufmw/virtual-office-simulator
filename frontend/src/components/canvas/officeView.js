import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Screen pixels per world unit at 100% zoom, shared by the plan views. */
export const PX = 24;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;
const FIT_PADDING = 0.88; // margin of canvas left around the room when fitting

const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

/** The dotted backdrop that reads as space outside the office. */
export const CANVAS_BACKDROP = {
  backgroundImage: "radial-gradient(#454d68 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/** How a desk plate is tinted, so both plan views agree on what a colour means. */
export function deskTone({ selected, taken, receiving, swapping, hoverable }) {
  if (swapping) return "border-lit bg-lit/30 ring-2 ring-lit";
  if (receiving) return "border-pick bg-pick/30 ring-2 ring-pick";
  if (selected) return "border-pick bg-pick/20 ring-2 ring-pick";
  if (taken) return `border-lit/50 bg-lit/12 ${hoverable ? "hover:border-lit hover:bg-lit/25" : ""}`;
  return `border-line bg-plate/80 ${hoverable ? "hover:border-paper/60 hover:bg-plate" : ""}`;
}

/**
 * Pan and zoom for a plan view. The world origin sits at the canvas centre,
 * shifted by the pan and scaled by the zoom, which keeps the screen-to-world
 * conversion exact without measuring any child element.
 */
export function useCanvasView(room) {
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null); // null until the canvas is measured

  const span = { w: room.maxX - room.minX, h: room.maxY - room.minY };

  useLayoutEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const zoom = clamp(
      Math.min(size.w / (span.w * PX), size.h / (span.h * PX)) * FIT_PADDING,
      MIN_ZOOM,
      MAX_ZOOM
    );
    setView({
      zoom,
      panX: -((room.minX + room.maxX) / 2) * PX * zoom,
      panY: ((room.minY + room.maxY) / 2) * PX * zoom,
    });
  }, [size.w, size.h, span.w, span.h, room.minX, room.maxX, room.minY, room.maxY]);

  useEffect(() => {
    if (!view && size.w && size.h) fit();
  }, [view, size.w, size.h, fit]);

  const zoom = view?.zoom ?? 1;
  const pan = { x: view?.panX ?? 0, y: view?.panY ?? 0 };

  const toWorld = useCallback(
    (clientX, clientY) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const originX = rect.left + rect.width / 2 + pan.x;
      const originY = rect.top + rect.height / 2 + pan.y;
      return {
        x: (clientX - originX) / (PX * zoom),
        y: -(clientY - originY) / (PX * zoom),
      };
    },
    [pan.x, pan.y, zoom]
  );

  // Zooms about a screen point, so the spot under the cursor stays put
  const zoomAround = useCallback(
    (factor, clientX, clientY) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;
      const atX = clientX ?? centreX;
      const atY = clientY ?? centreY;
      const at = toWorld(atX, atY);
      const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
      setView({
        zoom: next,
        panX: atX - centreX - at.x * PX * next,
        panY: atY - centreY + at.y * PX * next,
      });
    },
    [zoom, toWorld]
  );

  return { canvasRef, size, span, zoom, pan, setView, fit, toWorld, zoomAround };
}
