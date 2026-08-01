// Backend host follows whatever host the page was loaded from, so the app
// works both locally and when a colleague opens it over the LAN.
//
// In dev the backend is a separate process on :3001. In a production build
// the backend also serves these files, so it is simply wherever the page
// came from — which keeps the WebSocket on wss:// behind TLS. VITE_API_URL
// overrides both if the two are ever deployed apart.
const origin = import.meta.env.VITE_API_URL
  ? new URL(import.meta.env.VITE_API_URL)
  : new URL(
      import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin
    );

export const API_URL = origin.origin;
export const WS_URL = `${origin.protocol === "https:" ? "wss:" : "ws:"}//${origin.host}`;
export const SPEED = 5; // units per second
export const VIEW_SIZE = 8; // half-height of the orthographic camera view
export const SEND_INTERVAL = 0.05; // seconds between position broadcasts (~20 Hz)
export const CAMERA_LERP = 8; // camera follow smoothing factor
export const INTERACT_DISTANCE = 2.5; // how close two characters must be to chat
export const ARRIVE_DISTANCE = 0.1; // how close an auto-walk counts as arrived
export const WAYPOINT_DISTANCE = 0.25; // how close counts as reaching a mid-path waypoint
// Seconds of no progress before an auto-walk starts ignoring collisions,
// so nobody can be walled in by a desk dropped on top of them
export const STUCK_TIMEOUT = 5;
export const STRANDED_CHECK = 0.5; // seconds between "am I stuck in a wall?" checks
export const PATH_CELL = 0.5; // pathfinding grid resolution, in world units
// Placeable floor area, mirrored by BOUNDS in the backend's layout.js
export const ROOM_BOUNDS = { minX: -20, maxX: 20, minY: -13, maxY: 16 };
export const LAYOUT_SNAP = 0.5; // grid a dragged desk snaps to
export const PATH_DOT_SPACING = 0.45; // gap between the dots drawn along a path
