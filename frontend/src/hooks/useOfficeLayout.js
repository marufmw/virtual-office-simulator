import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { DEFAULT_ROOM, growRoom } from "../game/roomBounds";

/**
 * One office's floor plan and member list, and the edits made to them.
 *
 * Edits apply immediately so dragging feels direct, then roll back by
 * reloading the real plan if the server refuses — simpler than tracking
 * rollback state, and it can't drift out of step. The server's message is
 * written for the person editing, so it is surfaced as-is.
 */
export function useOfficeLayout(officeId) {
  const [desks, setDesks] = useState(null); // null while loading
  const [members, setMembers] = useState(null);
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState(null);

  const reload = useCallback(async () => {
    const [plan, list] = await Promise.all([api.office(officeId), api.members(officeId)]);
    if (!plan.ok) {
      setDesks([]);
      setFailed(true);
      setProblem(plan.error);
      return;
    }
    setDesks(plan.data.desks);
    setRoom(plan.data.room ?? DEFAULT_ROOM);
    setName(plan.data.office.name);
    if (list.ok) setMembers(list.data);
  }, [officeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const edit = useCallback(
    async (applyDesks, call, nextRoom) => {
      if (applyDesks) setDesks(applyDesks);
      if (nextRoom) setRoom(nextRoom);
      setProblem(null);

      const result = await call();
      if (!result.ok) {
        setProblem(result.error);
        await reload();
        return false;
      }
      // The server owns the room; a desk pushed outward will have grown it
      if (result.data?.room) setRoom(result.data.room);
      return true;
    },
    [reload]
  );

  const addDesk = useCallback(
    async (code, x, y) => {
      const done = await edit(null, () => api.createDesk(officeId, code, x, y), growRoom(room, x, y));
      if (done) await reload();
      return done;
    },
    [edit, officeId, reload, room]
  );

  const moveDesk = useCallback(
    (id, x, y) =>
      edit(
        (current) => current.map((d) => (d.id === id ? { ...d, x, y } : d)),
        () => api.moveDesk(officeId, id, x, y),
        growRoom(room, x, y)
      ),
    [edit, officeId, room]
  );

  const renameDesk = useCallback(
    (id, code) =>
      edit(
        (current) => current.map((d) => (d.id === id ? { ...d, code } : d)),
        () => api.renameDesk(officeId, id, code)
      ),
    [edit, officeId]
  );

  const removeDesk = useCallback(
    (id) =>
      edit(
        (current) => current.filter((d) => d.id !== id),
        () => api.deleteDesk(officeId, id)
      ),
    [edit, officeId]
  );

  /** Sits a member at a desk, or empties it with `email: null`. */
  const assignSeat = useCallback(
    async (deskId, email) => {
      const done = await edit(
        (current) =>
          current.map((d) => {
            if (d.id === deskId) return { ...d, email, occupant: null };
            // One desk each: wherever they were, they are not there now
            return email && d.email === email ? { ...d, email: null, occupant: null } : d;
          }),
        () => api.assignDesk(officeId, deskId, email)
      );
      if (done) await reload();
      return done;
    },
    [edit, officeId, reload]
  );

  /**
   * Trades two desks' occupants. Two assignments rather than one call:
   * moving somebody already frees the desk they came from, so doing the
   * arriving person first leaves the other desk empty to receive theirs.
   */
  const swapSeats = useCallback(
    async (deskA, deskB) => {
      const a = desks?.find((d) => d.id === deskA);
      const b = desks?.find((d) => d.id === deskB);
      if (!a || !b) return false;

      setProblem(null);
      const first = await api.assignDesk(officeId, deskB, a.email);
      if (!first.ok) {
        setProblem(first.error);
        await reload();
        return false;
      }
      if (b.email) {
        const second = await api.assignDesk(officeId, deskA, b.email);
        if (!second.ok) setProblem(second.error);
      }
      await reload();
      return true;
    },
    [desks, officeId, reload]
  );

  // Resizing by hand, which unlike dragging a desk may also shrink the room
  const resizeRoom = useCallback(
    (next) => edit(null, () => api.setRoom(officeId, next), next),
    [edit, officeId]
  );

  const rename = useCallback(
    async (next) => {
      const result = await api.renameOffice(officeId, next);
      if (!result.ok) {
        setProblem(result.error);
        return false;
      }
      setName(result.data.name);
      return true;
    },
    [officeId]
  );

  // --- The member list -----------------------------------------------------

  const memberEdit = useCallback(
    async (call) => {
      setProblem(null);
      const result = await call();
      if (!result.ok) {
        setProblem(result.error);
        return false;
      }
      await reload();
      return true;
    },
    [reload]
  );

  const addMember = useCallback(
    (email) => memberEdit(() => api.addMember(officeId, email)),
    [memberEdit, officeId]
  );

  const removeMember = useCallback(
    (email) => memberEdit(() => api.removeMember(officeId, email)),
    [memberEdit, officeId]
  );

  const setRole = useCallback(
    (email, role) => memberEdit(() => api.setRole(officeId, email, role)),
    [memberEdit, officeId]
  );

  return {
    desks,
    members,
    room,
    name,
    failed,
    problem,
    setProblem,
    reload,
    addDesk,
    moveDesk,
    renameDesk,
    removeDesk,
    assignSeat,
    swapSeats,
    resizeRoom,
    rename,
    addMember,
    removeMember,
    setRole,
  };
}
