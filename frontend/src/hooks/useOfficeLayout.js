import { useCallback, useEffect, useState } from "react";
import * as layout from "../api/layout";
import { DEFAULT_ROOM, growRoom } from "../game/roomBounds";

/**
 * Owns the floor plan: the room's walls, every desk, and the edits made to
 * them. Edits apply immediately so dragging feels direct, then roll back
 * to the previous plan if the server refuses, surfacing its message.
 *
 * `onSeatChange` and `onDeskRemoved` let a caller follow along when the
 * person or desk it cares about moves.
 */
export function useOfficeLayout({ onSeatChange, onDeskRemoved } = {}) {
  const [desks, setDesks] = useState(null); // null while loading
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState(null);

  const reload = useCallback(async () => {
    const result = await layout.fetchOffice();
    if (!result.ok) {
      setDesks([]);
      setFailed(true);
      return;
    }
    setDesks(result.data.desks);
    setRoom(result.data.room ?? DEFAULT_ROOM);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Applies an edit straight away so dragging feels direct, then asks the
   * server. A refused edit is undone by reloading the real floor plan —
   * simpler than tracking rollback state, and it can't drift out of step.
   */
  const edit = useCallback(
    async (applyDesks, call, nextRoom) => {
      setDesks(applyDesks);
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

  const moveDesk = useCallback(
    (id, x, y) =>
      edit(
        (current) => current.map((d) => (d.id === id ? { ...d, x, y } : d)),
        () => layout.moveDesk(id, x, y),
        growRoom(room, x, y)
      ),
    [edit, room]
  );

  const addDesk = useCallback(
    (id, x, y) =>
      edit(
        (current) => [...current, { id, x, y, occupant: null, occupant_character: null }],
        () => layout.createDesk(id, x, y),
        growRoom(room, x, y)
      ),
    [edit, room]
  );

  const removeDesk = useCallback(
    (id) => {
      onDeskRemoved?.(id);
      return edit(
        (current) => current.filter((d) => d.id !== id),
        () => layout.deleteDesk(id)
      );
    },
    [edit, onDeskRemoved]
  );

  // Dropping someone on an occupied desk trades the two places
  const reseat = useCallback(
    (fromDeskId, toDeskId) => {
      onSeatChange?.(fromDeskId, toDeskId);
      return edit((current) => {
        const seatOf = (desk) => ({
          occupant: desk.occupant,
          occupant_character: desk.occupant_character,
        });
        const mover = current.find((d) => d.id === fromDeskId);
        const target = current.find((d) => d.id === toDeskId);
        return current.map((d) => {
          if (d.id === fromDeskId) return { ...d, ...seatOf(target) };
          if (d.id === toDeskId) return { ...d, ...seatOf(mover) };
          return d;
        });
      }, () => layout.reseatPerson(fromDeskId, toDeskId));
    },
    [edit, onSeatChange]
  );

  const renameOccupant = useCallback(
    (deskId, name) =>
      edit(
        (current) => current.map((d) => (d.id === deskId ? { ...d, occupant: name } : d)),
        () => layout.renameOccupant(deskId, name)
      ),
    [edit]
  );

  const clearSeat = useCallback(
    (deskId) =>
      edit(
        (current) =>
          current.map((d) =>
            d.id === deskId ? { ...d, occupant: null, occupant_character: null } : d
          ),
        () => layout.clearSeat(deskId)
      ),
    [edit]
  );

  // Resizing by hand, which unlike dragging a desk may also shrink the room
  const resizeRoom = useCallback(
    (next) => edit((current) => current, () => layout.setRoom(next), next),
    [edit]
  );

  const reset = useCallback(async () => {
    const result = await layout.resetLayout();
    if (!result.ok) {
      setProblem(result.error);
      return false;
    }
    setDesks(result.data.desks);
    setRoom(result.data.room ?? DEFAULT_ROOM);
    setProblem(null);
    return true;
  }, []);

  return {
    desks,
    room,
    failed,
    problem,
    setProblem,
    addDesk,
    moveDesk,
    removeDesk,
    reseat,
    renameOccupant,
    clearSeat,
    resizeRoom,
    reset,
  };
}
