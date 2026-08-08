import { LayoutEditor } from "./LayoutEditor";
import { useOfficeLayout } from "../hooks/useOfficeLayout";

/**
 * Running an office: the floor plan and the member list, wired to the
 * server. Reached from the picker's Manage button, or from inside the
 * office itself — either way it takes over the screen.
 */
export function OfficeAdmin({ officeId, me, onClose }) {
  const office = useOfficeLayout(officeId);

  if (office.desks === null) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink">
        <p className="code text-xs text-muted">reading the floor plan…</p>
      </div>
    );
  }

  return (
    <LayoutEditor
      officeName={office.name}
      desks={office.desks}
      members={office.members ?? []}
      room={office.room}
      me={me}
      problem={office.problem}
      onDismissProblem={() => office.setProblem(null)}
      onMove={office.moveDesk}
      onRename={office.renameDesk}
      onAdd={office.addDesk}
      onDelete={office.removeDesk}
      onAssign={office.assignSeat}
      onSwap={office.swapSeats}
      onResizeRoom={office.resizeRoom}
      onAddMember={office.addMember}
      onRemoveMember={office.removeMember}
      onSetRole={office.setRole}
      onClose={onClose}
    />
  );
}
