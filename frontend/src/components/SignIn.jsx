import { useEffect, useRef, useState } from "react";
import { Building2, LoaderCircle, TriangleAlert } from "lucide-react";
import { api } from "../api/client";

const GSI_SRC = "https://accounts.google.com/gsi/client";

/** Loads Google's sign-in script once, however many times this mounts. */
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("blocked")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(script);
  });
}

/**
 * The door. Google hands the browser an ID token, the server checks it
 * against Google's keys and gives us a session of our own — nothing here
 * decides who anybody is.
 */
export function SignIn({ config, onSignedIn }) {
  const buttonRef = useRef(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  const clientId = config?.googleClientId ?? null;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            setProblem(null);
            const result = await api.signInWithGoogle(credential);
            setBusy(false);
            if (!result.ok) return setProblem(result.error);
            onSignedIn(result.data.token, result.data.user);
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 280,
        });
      })
      .catch(() =>
        setProblem("Google's sign-in script didn't load. An ad blocker will do that.")
      );

    return () => {
      cancelled = true;
    };
  }, [clientId, onSignedIn]);

  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-ink px-6 py-12 text-paper">
      {/* A soft glow behind the card, so the page isn't a flat black field */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pick/10 blur-[120px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-room text-pick">
            <Building2 size={22} />
          </span>
          <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight">
            The office is open
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sign in and walk into your desk. You&rsquo;ll see the offices you&rsquo;ve been
            added to — or start one of your own.
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-line/70 bg-room p-5">
          {clientId ? (
            <div className="flex min-h-[44px] items-center justify-center">
              {busy ? (
                <span className="code flex items-center gap-2 text-xs text-muted">
                  <LoaderCircle size={14} className="animate-spin" />
                  signing you in…
                </span>
              ) : (
                <div ref={buttonRef} />
              )}
            </div>
          ) : (
            <DevSignIn enabled={config?.devSignIn} onSignedIn={onSignedIn} onProblem={setProblem} />
          )}

          {problem && (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-red-400/40 bg-red-950/60 px-3 py-2 text-xs leading-relaxed text-red-100">
              <TriangleAlert size={14} className="mt-px shrink-0" />
              {problem}
            </p>
          )}
        </div>

        <p className="code mt-6 text-center text-[10px] uppercase tracking-wider text-muted/70">
          {clientId ? "google accounts only" : "development sign-in"}
        </p>
      </div>
    </main>
  );
}

/**
 * What stands in for Google before anyone has been to the Google console:
 * type an email and you are that person. The server only offers this when
 * it has no client id and isn't in production.
 */
function DevSignIn({ enabled, onSignedIn, onProblem }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  if (!enabled) {
    return (
      <p className="text-center text-sm leading-relaxed text-muted">
        Google sign-in isn&rsquo;t configured on this server, so there is no way in.
        <span className="code mt-2 block text-[11px] text-muted/70">set GOOGLE_CLIENT_ID</span>
      </p>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    onProblem(null);
    const result = await api.signInAsDeveloper(email.trim());
    setBusy(false);
    if (!result.ok) return onProblem(result.error);
    onSignedIn(result.data.token, result.data.user);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="code text-[10px] uppercase text-muted">Email</span>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-md border border-line bg-ink px-3 py-2 text-paper placeholder-muted/60 outline-none transition-colors focus:border-pick"
        />
      </label>
      <button
        type="submit"
        disabled={!email.trim() || busy}
        className="rounded-md bg-pick py-2.5 font-display font-bold text-ink transition-colors hover:bg-pick/85 disabled:cursor-not-allowed disabled:bg-plate disabled:text-muted"
      >
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
