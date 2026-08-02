import { Map, Armchair } from "lucide-react";

/**
 * The row of round buttons in the top corner. A flex row rather than three
 * separately positioned buttons, so adding one doesn't mean recomputing
 * everyone's offset, and the notch is dodged once for the lot.
 */
export function TopControls({ onOpenMap, onGoToDesk, showGoToDesk, children }) {
  return (
    <div
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      className="absolute right-3 z-10 flex items-center gap-2 sm:right-4"
    >
      <TopButton onClick={onOpenMap} label="Office map">
        <Map size={20} />
      </TopButton>
      {showGoToDesk && (
        <TopButton onClick={onGoToDesk} label="Go to my desk">
          <Armchair size={20} />
        </TopButton>
      )}
      {children}
    </div>
  );
}

export function TopButton({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-700 hover:text-white active:bg-slate-700"
    >
      {children}
    </button>
  );
}
