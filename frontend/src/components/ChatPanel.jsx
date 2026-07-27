import { useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";

const timeOf = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * One-on-one messenger docked in the corner: a header with the other
 * person's name, the message history, and a composer. `messages` are
 * `{ mine, body, createdAt }`, oldest first.
 */
export function ChatPanel({ peerName, messages, onSend, onClose, disabled }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="absolute bottom-4 right-4 z-20 flex h-96 w-80 flex-col overflow-hidden rounded-lg border border-slate-600 bg-slate-800 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-900/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${disabled ? "bg-slate-500" : "bg-emerald-400"}`}
          />
          <h2 className="text-sm font-semibold text-slate-100">{peerName}</h2>
        </div>
        <button
          onClick={onClose}
          title="Close chat"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Say hello to {peerName}.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                m.mine
                  ? "rounded-br-sm bg-sky-600 text-white"
                  : "rounded-bl-sm bg-slate-700 text-slate-100"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <time className="mt-1 block text-[10px] opacity-60">{timeOf(m.createdAt)}</time>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-slate-700 p-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? "They walked away…" : "Type a message"}
          disabled={disabled}
          maxLength={1000}
          className="min-w-0 flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none ring-sky-500 focus:ring-1 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || draft.trim() === ""}
          title="Send"
          className="rounded-md bg-sky-600 px-3 text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
