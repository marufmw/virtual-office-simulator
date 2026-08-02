import { useState } from "react";
import { Settings } from "lucide-react";
import { ProfileForm } from "./ProfileForm";
import { TopButton } from "./TopControls";

/**
 * Floating settings button that opens a modal for editing the
 * current profile (name, desk ID, character).
 */
export function SettingsButton({ joinInfo, onSave }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Positioned by the row it sits in, not by itself */}
      <TopButton onClick={() => setOpen(true)} label="Settings">
        <Settings size={20} />
      </TopButton>
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
