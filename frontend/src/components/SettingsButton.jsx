import { useState } from "react";
import { Settings } from "lucide-react";
import { ProfileForm } from "./ProfileForm";

/**
 * Floating settings button that opens a modal for editing the
 * current profile (name, desk ID, character).
 */
export function SettingsButton({ joinInfo, onSave }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Settings"
        className="absolute right-4 top-4 z-10 rounded-full bg-slate-800/80 p-3 text-slate-300 shadow-lg transition-colors hover:bg-slate-700 hover:text-white"
      >
        <Settings size={20} />
      </button>
      {open && (
        <ProfileForm
          title="Your desk"
          initial={{
            name: joinInfo.name,
            deskId: joinInfo.deskId,
            character: localStorage.getItem("character") ?? undefined,
          }}
          submitLabel="Save changes"
          onSubmit={(profile) => {
            onSave(profile);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
