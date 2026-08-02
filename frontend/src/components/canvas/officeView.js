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

/**
 * Wheel and trackpad zooming, bound straight to the canvas node.
 *
 * React registers its wheel handler on the root as a passive listener, so a
 * `preventDefault` inside `onWheel` is refused and the browser scrolls or
 * zooms the whole page underneath the plan. Only a listener registered with
 * `passive: false` is allowed to say no, and that means binding it here.
 */
export function useWheelZoom(canvasRef, zoomAround) {
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;

    const onWheel = (e) => {
      e.preventDefault();
      // Ctrl and the wheel is how a trackpad pinch arrives; it comes in
      // finer steps than a mouse's notches, so it gets a gentler factor
      const step = e.ctrlKey ? 1.04 : 1.12;
      zoomAround(e.deltaY < 0 ? step : 1 / step, e.clientX, e.clientY);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [canvasRef, zoomAround]);
}

/**
 * Two-finger pinch on a plan view. Returns handlers to spread onto the
 * canvas; while two fingers are down it owns the gesture and reports
 * `pinching` so the one-finger pan stands aside.
 *
 * Zoom follows the distance between the fingers and is applied about their
 * midpoint, so the office stretches around what's being looked at.
 */
export function usePinchZoom({ zoom, zoomAround }) {
  const touches = useRef(new Map());
  const startRef = useRef(null);
  const [pinching, setPinching] = useState(false);

  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const { distance } = spread();
      startRef.current = { distance, zoom };
      setPinching(true);
    }
  };

  const onPointerMove = (e) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size !== 2 || !startRef.current) return;

    const { distance, midX, midY } = spread();
    if (startRef.current.distance === 0) return;
    // zoomAround multiplies, so ask for the factor that lands on the zoom
    // this spread should mean
    const target = startRef.current.zoom * (distance / startRef.current.distance);
    zoomAround(target / zoom, midX, midY);
  };

  const onPointerUp = (e) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) {
      startRef.current = null;
      setPinching(false);
    }
  };

  return { pinching, onPointerDown, onPointerMove, onPointerUp };
}
