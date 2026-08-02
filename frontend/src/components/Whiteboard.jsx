import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { X, Users } from "lucide-react";

/**
 * Excalidraw is a large thing to carry — bigger than the rest of the app put
 * together — so it is fetched only when somebody actually walks up to the
 * board, not on the way into the office.
 */
const Excalidraw = lazy(async () => {
  const module = await import("@excalidraw/excalidraw");
  await import("@excalidraw/excalidraw/index.css");
  return { default: module.Excalidraw };
});

const BROADCAST_MS = 90; // how often local edits go out
const POINTER_MS = 60; // and how often the pen's position does

// Cursor colours, so two people at the board are told apart at a glance
const CURSOR_COLORS = ["#38bdf8", "#f5b544", "#4ade80", "#f472b6", "#a78bfa", "#22d3ee"];

/**
 * Which of two versions of an element to keep — the same rule the server
 * uses, so both ends of the wire agree on what the drawing looks like.
 */
function newer(incoming, existing) {
  if (!existing) return true;
  const a = incoming.version ?? 0;
  const b = existing.version ?? 0;
  if (a !== b) return a > b;
  return (incoming.versionNonce ?? 0) > (existing.versionNonce ?? 0);
}

/**
 * The shared whiteboard, open while you're standing at it.
 *
 * The scene is kept in a ref rather than state: Excalidraw owns the canvas
 * and is told about changes imperatively through `updateScene`, and putting
 * every stroke through React would only make the drawing stutter.
 */
export function Whiteboard({ initialElements, members, handlersRef, onBroadcast, onPointer, onClose }) {
  const [api, setApi] = useState(null);
  const sentRef = useRef(new Map()); // element id -> the version we last sent
  const collaboratorsRef = useRef(new Map());
  const broadcastTimer = useRef(0);
  const pointerTimer = useRef(0);

  // What was already on the board is not ours to announce
  useEffect(() => {
    for (const element of initialElements ?? []) {
      if (element?.id) sentRef.current.set(element.id, element.version ?? 0);
    }
  }, [initialElements]);

  /**
   * Folds someone else's strokes into the canvas without disturbing ours.
   * The current scene is read from Excalidraw at this moment rather than
   * mirrored as we go — remote updates are rare, local strokes are not, and
   * keeping a copy in step cost a pass over every element on the board for
   * every twitch of the pen.
   */
  const applyRemote = useCallback(
    (incoming) => {
      if (!api || !incoming?.length) return;
      const scene = new Map(api.getSceneElements().map((e) => [e.id, e]));
      let changed = false;
      for (const element of incoming) {
        if (!element?.id || !newer(element, scene.get(element.id))) continue;
        scene.set(element.id, element);
        // Someone else's version is now the truth; don't echo it back
        sentRef.current.set(element.id, element.version ?? 0);
        changed = true;
      }
      if (changed) api.updateScene({ elements: [...scene.values()] });
    },
    [api]
  );

  /** Moves someone else's cursor. Excalidraw draws these itself. */
  const applyPointer = useCallback(
    ({ id, name, pointer, button, selectedElementIds }) => {
      if (!api) return;
      const colour = CURSOR_COLORS[id % CURSOR_COLORS.length];
      collaboratorsRef.current.set(String(id), {
        id: String(id),
        username: name ?? "Someone",
        pointer,
        button: button ?? "up",
        selectedElementIds,
        color: { background: colour, stroke: colour },
      });
      api.updateScene({ collaborators: new Map(collaboratorsRef.current) });
    },
    [api]
  );

  // The socket reaches the board through here
  useEffect(() => {
    handlersRef.current = { applyRemote, applyPointer };
    return () => {
      handlersRef.current = null;
    };
  }, [handlersRef, applyRemote, applyPointer]);

  // Anyone who walked away should not leave a cursor behind
  useEffect(() => {
    if (!api) return;
    const present = new Set(members.map((m) => String(m.id)));
    for (const id of [...collaboratorsRef.current.keys()]) {
      if (!present.has(id)) collaboratorsRef.current.delete(id);
    }
    api.updateScene({ collaborators: new Map(collaboratorsRef.current) });
  }, [api, members]);

  /**
   * Excalidraw calls this on every change, including ones we caused by
   * applying somebody else's. Only elements whose version has moved past
   * what we last sent go out, which keeps the two clients from bouncing the
   * same stroke back and forth forever.
   */
  const handleChange = useCallback(
    (elements) => {
      // The throttle comes first: Excalidraw calls this on every pointer
      // move, and everything below is work per element on the board
      const now = performance.now();
      if (now - broadcastTimer.current < BROADCAST_MS) return;
      broadcastTimer.current = now;

      const changed = [];
      for (const element of elements) {
        if ((element.version ?? 0) <= (sentRef.current.get(element.id) ?? -1)) continue;
        sentRef.current.set(element.id, element.version ?? 0);
        changed.push(element);
      }
      if (changed.length > 0) onBroadcast(changed);
    },
    [onBroadcast]
  );

  const handlePointer = useCallback(
    (payload) => {
      const now = performance.now();
      if (now - pointerTimer.current < POINTER_MS) return;
      pointerTimer.current = now;
      onPointer({ pointer: payload.pointer, button: payload.button });
    },
    [onPointer]
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/50 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <div className="min-w-0">
          <h1 className="font-display text-base font-extrabold leading-none tracking-tight text-paper">
            Whiteboard
          </h1>
          <p className="code mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
            <Users size={11} />
            {members.length === 1 ? "just you" : `${members.length} drawing`}
          </p>
        </div>

        {/* Who else is at the board */}
        <div className="ml-2 flex min-w-0 flex-wrap items-center gap-1.5">
          {members.map((m) => (
            <span
              key={m.id}
              className="flex items-center gap-1.5 rounded-full border border-line/60 bg-room px-2 py-1 text-[11px] text-paper"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CURSOR_COLORS[m.id % CURSOR_COLORS.length] }}
              />
              {m.name}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Leave the whiteboard"
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-paper/40 hover:text-paper"
        >
          <X size={18} />
        </button>
      </header>

      {/* Excalidraw brings its own light theme; the office is dark, so the
          canvas is told to match rather than glare */}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <p className="code text-xs text-muted">unrolling the whiteboard…</p>
            </div>
          }
        >
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={{
              elements: initialElements ?? [],
              appState: { viewBackgroundColor: "#ffffff", theme: "dark" },
              scrollToContent: true,
            }}
            isCollaborating
            onChange={handleChange}
            onPointerUpdate={handlePointer}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
          />
        </Suspense>
      </div>
    </div>
  );
}
