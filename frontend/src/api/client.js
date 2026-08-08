import { API_URL } from "../config";

/**
 * Everything the app asks the server over HTTP, and the session token it
 * asks with.
 *
 * The token is kept in localStorage rather than a cookie: in development
 * the page and the API are different origins, and a cookie that survives
 * that has to be `SameSite=None; Secure`, which plain http://localhost is
 * not. A bearer header works the same in both places.
 */
const TOKEN_KEY = "office.session";

let token = localStorage.getItem(TOKEN_KEY);

export const getToken = () => token;

export function setToken(next) {
  token = next ?? null;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * One call. Resolves to `{ ok, data }` or `{ ok: false, error, status }`
 * with a message written for the person reading it, so callers can show it
 * as-is.
 */
async function request(path, options = {}) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error ?? "That didn't work" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: "The office isn't answering" };
  }
}

const send = (method) => (path, body) =>
  request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const post = send("POST");
const patch = send("PATCH");
const del = send("DELETE");
const get = (path) => request(path, { method: "GET" });

const office = (id) => `/api/offices/${encodeURIComponent(id)}`;

export const api = {
  // --- Signing in ---
  authConfig: () => get("/api/auth/config"),
  signInWithGoogle: (credential) => post("/api/auth/google", { credential }),
  signInAsDeveloper: (email, name) => post("/api/auth/dev", { email, name }),
  session: () => get("/api/session"),

  // --- Offices ---
  offices: () => get("/api/offices"),
  createOffice: (name) => post("/api/offices", { name }),
  office: (id) => get(office(id)),
  renameOffice: (id, name) => patch(office(id), { name }),
  closeOffice: (id) => del(office(id)),

  // --- The member list ---
  members: (id) => get(`${office(id)}/members`),
  addMember: (id, email) => post(`${office(id)}/members`, { email }),
  setRole: (id, email, role) => patch(`${office(id)}/members/${encodeURIComponent(email)}`, { role }),
  removeMember: (id, email) => del(`${office(id)}/members/${encodeURIComponent(email)}`),

  // --- The floor plan ---
  createDesk: (id, code, x, y) => post(`${office(id)}/desks`, { code, x, y }),
  moveDesk: (id, deskId, x, y) => patch(`${office(id)}/desks/${deskId}`, { x, y }),
  renameDesk: (id, deskId, code) => patch(`${office(id)}/desks/${deskId}`, { code }),
  deleteDesk: (id, deskId) => del(`${office(id)}/desks/${deskId}`),
  /** `email: null` empties the desk */
  assignDesk: (id, deskId, email) => patch(`${office(id)}/desks/${deskId}/occupant`, { email }),
  setRoom: (id, room) => patch(`${office(id)}/room`, room),
};
