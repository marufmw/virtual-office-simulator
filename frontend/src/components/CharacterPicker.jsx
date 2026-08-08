import { Check, X } from "lucide-react";
import { CHARACTER_NAMES } from "../game/createAnimatedPlayer";
import { CharacterPreview } from "./CharacterPreview";

/**
 * The one thing about yourself you get to choose in here.
 *
 * Your name comes from Google and your desk from the admin, so this is the
 * whole of the profile: which character walks around as you.
 */
export function CharacterPicker({ current, onPick, onClose }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/80 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line/70 bg-room p-5 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-display text-base font-extrabold tracking-tight text-paper">
              Your character
            </h2>
            <p className="text-xs text-muted">Everyone in the office sees the change at once.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-full border border-line p-2 text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {CHARACTER_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onPick(name)}
              title={name.replaceAll("_", " ")}
              aria-pressed={current === name}
              className={`relative flex aspect-square items-center justify-center rounded-md border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pick ${
                current === name
                  ? "border-pick bg-pick/15"
                  : "border-line/50 bg-ink hover:border-line hover:bg-plate/60"
              }`}
            >
              <CharacterPreview name={name} size={38} />
              {current === name && (
                <Check size={10} className="absolute right-0.5 top-0.5 text-pick" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
