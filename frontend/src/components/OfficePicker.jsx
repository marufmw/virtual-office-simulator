import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  LoaderCircle,
  LogOut,
  Plus,
  Settings2,
  Users,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Where you land after signing in: every office you've been let into, and
 * a way to start one of your own.
 *
 * Seating is the admin's to give, so an office you're a member of but have
 * no desk in is shown and not enterable — the card says who to ask.
 */
export function OfficePicker({ user, notice, onEnter, onManage, onSignOut }) {
  const [offices, setOffices] = useState(null); // null while loading
  const [problem, setProblem] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.offices();
    if (!result.ok) {
      setOffices([]);
      setProblem(result.error);
      return;
    }
    setOffices(result.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const result = await api.createOffice(name.trim());
    setBusy(false);
    if (!result.ok) return setProblem(result.error);
    setName("");
    setCreating(false);
    await load();
    // A new office is an empty one; its admin goes straight to the plan
    onManage(result.data);
  }

  return (
    <main className="fixed inset-0 z-40 overflow-y-auto bg-ink text-paper">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line/60 bg-ink/95 px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] backdrop-blur">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-room text-pick">
          <Building2 size={16} />
        </span>
        <h1 className="font-display text-base font-extrabold tracking-tight">Your offices</h1>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm leading-tight text-paper">{user.name}</p>
            <p className="code truncate text-[10px] text-muted">{user.email}</p>
          </div>
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-room text-xs font-bold text-pick">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            className="rounded-md border border-line p-2 text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-5 py-8">
        {/* Why we're back here, when leaving wasn't our idea */}
        {notice && (
          <p className="mb-5 rounded-md border border-lit/40 bg-plate/60 px-4 py-2.5 text-sm text-paper">
            {notice}
          </p>
        )}
        {problem && (
          <p className="mb-5 rounded-md border border-red-400/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-100">
            {problem}
          </p>
        )}

        {offices === null ? (
          <p className="code flex items-center gap-2 py-16 text-xs text-muted">
            <LoaderCircle size={14} className="animate-spin" />
            reading your offices…
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {offices.map((office) => (
              <OfficeCard
                key={office.id}
                office={office}
                onEnter={() => onEnter(office)}
                onManage={() => onManage(office)}
              />
            ))}

            {creating ? (
              <form
                onSubmit={create}
                className="flex flex-col gap-3 rounded-xl border border-pick/60 bg-room p-5"
              >
                <label className="flex flex-col gap-2">
                  <span className="code text-[10px] uppercase text-muted">Office name</span>
                  <input
                    autoFocus
                    value={name}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
                    placeholder="Threed HQ"
                    className="rounded-md border border-line bg-ink px-3 py-2 text-paper placeholder-muted/60 outline-none transition-colors focus:border-pick"
                  />
                </label>
                <p className="text-xs leading-relaxed text-muted">
                  You&rsquo;ll be its admin: you lay out the desks, keep the member list, and
                  decide who sits where.
                </p>
                <div className="mt-auto flex gap-2">
                  <button
                    type="submit"
                    disabled={!name.trim() || busy}
                    className="flex-1 rounded-md bg-pick py-2 text-sm font-bold text-ink transition-colors hover:bg-pick/85 disabled:cursor-not-allowed disabled:bg-plate disabled:text-muted"
                  >
                    {busy ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded-md border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-paper/40 hover:text-paper"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line/80 p-5 text-muted transition-colors hover:border-pick/60 hover:text-paper"
              >
                <Plus size={20} />
                <span className="text-sm font-semibold">Create an office</span>
                <span className="text-xs text-muted/80">You&rsquo;ll be the admin</span>
              </button>
            )}
          </div>
        )}

        {offices?.length === 0 && !creating && (
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Nobody has added <span className="code text-paper">{user.email}</span> to an office
            yet. Ask an admin to put you on their member list — or start your own above.
          </p>
        )}
      </div>
    </main>
  );
}

function OfficeCard({ office, onEnter, onManage }) {
  const isAdmin = office.role === "admin";
  const canEnter = Boolean(office.seat);

  return (
    <section className="flex min-h-[9.5rem] flex-col gap-3 rounded-xl border border-line/70 bg-room p-5 transition-colors hover:border-line">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight">
          {office.name}
        </h2>
        {isAdmin && (
          <span className="code shrink-0 rounded-full border border-pick/50 px-2 py-0.5 text-[10px] uppercase text-pick">
            admin
          </span>
        )}
      </div>

      <dl className="code flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <div className="flex items-center gap-1.5">
          <Users size={12} />
          {office.members} {office.members === 1 ? "member" : "members"}
        </div>
        <div>{office.desks} desks</div>
        {office.seat ? (
          <div className="text-lit">your desk · {office.seat.code}</div>
        ) : (
          <div className="text-muted/70">no desk yet</div>
        )}
      </dl>

      <div className="mt-auto flex gap-2">
        <button
          type="button"
          onClick={onEnter}
          disabled={!canEnter}
          title={canEnter ? `Walk into ${office.name}` : "The admin hasn't given you a desk yet"}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-pick py-2 text-sm font-bold text-ink transition-colors hover:bg-pick/85 disabled:cursor-not-allowed disabled:bg-plate disabled:text-muted"
        >
          Walk in
          <ArrowRight size={14} />
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={onManage}
            title="Layout and members"
            className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            <Settings2 size={14} />
            Manage
          </button>
        )}
      </div>

      {!canEnter && !isAdmin && (
        <p className="text-xs leading-relaxed text-muted/80">
          You&rsquo;re on the member list, but nobody has sat you down yet.
        </p>
      )}
      {!canEnter && isAdmin && (
        <p className="text-xs leading-relaxed text-muted/80">
          Give yourself a desk in Manage, then walk in.
        </p>
      )}
    </section>
  );
}
