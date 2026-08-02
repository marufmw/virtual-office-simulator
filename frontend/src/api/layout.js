import { API_URL } from "../config";

/**
 * Floor-plan editing calls. Each resolves to `{ ok, data }` or
 * `{ ok: false, error }` with a message written for the person editing,
 * so callers can show it as-is.
 */
async function request(path, options) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "That didn't work" };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "The office isn't answering" };
  }
}

// The whole floor plan: the room's walls plus every desk in it
export const fetchOffice = () => request("/api/office", { method: "GET" });

export const createDesk = (id, x, y) =>
  request("/api/desks", { method: "POST", body: JSON.stringify({ id, x, y }) });

export const moveDesk = (id, x, y) =>
  request(`/api/desks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ x, y }),
  });

export const deleteDesk = (id) =>
  request(`/api/desks/${encodeURIComponent(id)}`, { method: "DELETE" });

// The person at a desk, rather than the desk itself
export const renameOccupant = (deskId, name) =>
  request(`/api/desks/${encodeURIComponent(deskId)}/occupant`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const clearSeat = (deskId) =>
  request(`/api/desks/${encodeURIComponent(deskId)}/occupant`, { method: "DELETE" });

export const reseatPerson = (fromDeskId, toDeskId) =>
  request("/api/reseat", { method: "POST", body: JSON.stringify({ fromDeskId, toDeskId }) });

// Resizing by hand, which unlike dragging a desk may also shrink the room
export const setRoom = (room) =>
  request("/api/room", { method: "PATCH", body: JSON.stringify(room) });

export const resetLayout = () => request("/api/layout/reset", { method: "POST" });
