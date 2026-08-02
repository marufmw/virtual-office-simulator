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
        aria-label="Settings"
        // The safe-area gap belongs above the button, not inside it — as
        // padding it pushed the cog off centre
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        className="absolute right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 shadow-lg transition-colors hover:bg-slate-700 hover:text-white sm:right-4"
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
