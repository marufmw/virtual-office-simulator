import { MonitorSmartphone, DoorOpen, LogIn } from "lucide-react";

/**
 * Shown to the tab that just lost the character, because opening the office
 * somewhere else hands it over: the newest client always wins. You are
 * still you — it is the same account and the same desk — so the only
 * question is which window walks you around.
 */
export function SeatClaim({ deskCode, onClaim, onLeave }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/95 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line/70 bg-room p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-ink/70 text-pick">
          <MonitorSmartphone size={22} />
        </div>

        <h1 className="font-display text-lg font-extrabold tracking-tight text-paper">
          {deskCode} moved to another window
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You opened the office somewhere else, so this one stepped aside. One window at a time,
          or you&rsquo;d be walking yourself around twice.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClaim}
            className="flex items-center justify-center gap-2 rounded-md bg-pick py-3 font-display font-bold text-ink transition-colors hover:bg-pick/85"
          >
            <LogIn size={16} />
            Take it back here
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="flex items-center justify-center gap-2 rounded-md border border-line py-3 text-sm text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <DoorOpen size={16} />
            Back to my offices
          </button>
        </div>

        <p className="mt-4 text-xs text-muted/70">
          Taking it back sends the other window to this screen instead.
        </p>
      </div>
    </div>
  );
}

/**
 * The quieter half of the same story, for the client that *is* driving:
 * the ones it displaced are still sitting on the claim screen, and any of
 * them can take the character back.
 */
export function SeatContested({ waiting }) {
  return (
    <p className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-20 -translate-x-1/2 rounded-full border border-lit/40 bg-ink/90 px-4 py-2 text-xs text-lit shadow-lg">
      {waiting === 1 ? "Another device has" : `${waiting} other devices have`} this character
      waiting
    </p>
  );
}
