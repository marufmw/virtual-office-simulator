// Backend host follows whatever host the page was loaded from, so the app
// works both locally and when a colleague opens it over the LAN.
const BACKEND_HOST = `${window.location.hostname}:3001`;
export const WS_URL = `ws://${BACKEND_HOST}`;
export const API_URL = `http://${BACKEND_HOST}`;
export const SPEED = 5; // units per second
export const VIEW_SIZE = 8; // half-height of the orthographic camera view
export const SEND_INTERVAL = 0.05; // seconds between position broadcasts (~20 Hz)
export const CAMERA_LERP = 8; // camera follow smoothing factor
export const INTERACT_DISTANCE = 2.5; // how close two characters must be to chat
export const ARRIVE_DISTANCE = 0.1; // how close an auto-walk counts as arrived
export const WAYPOINT_DISTANCE = 0.25; // how close counts as reaching a mid-path waypoint
export const STUCK_TIMEOUT = 2; // seconds of no progress before an auto-walk gives up
export const PATH_CELL = 0.5; // pathfinding grid resolution, in world units
// Placeable floor area, mirrored by BOUNDS in the backend's layout.js
export const ROOM_BOUNDS = { minX: -20, maxX: 20, minY: -13, maxY: 16 };
export const LAYOUT_SNAP = 0.5; // grid a dragged desk snaps to
export const PATH_DOT_SPACING = 0.45; // gap between the dots drawn along a path
