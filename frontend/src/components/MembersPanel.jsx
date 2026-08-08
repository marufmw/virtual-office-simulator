import { useState } from "react";
import { Mail, Shield, ShieldOff, UserMinus, UserPlus, Armchair } from "lucide-react";

/**
 * The member list: who is allowed into this office, and where each of them
 * sits. Adding somebody is adding an email — they may never have signed in
 * here, and the seat is waiting for them when they do.
 */
export function MembersPanel({ members, desks, me, onAdd, onRemove, onSetRole, onSeat }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const free = (desks ?? []).filter((d) => !d.email);
  const seated = (members ?? []).filter((m) => m.seat).length;

  async function add(e) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    const done = await onAdd(email.trim());
    setBusy(false);
    if (done) setEmail("");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto p-6">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight">Members</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Anyone on this list can walk in — once you&rsquo;ve given them a desk. Email is the
          identity: whoever signs in with it is that person.
        </p>
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <label className="relative min-w-52 flex-1">
          <Mail
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full rounded-md border border-line bg-room py-2.5 pl-9 pr-3 text-paper placeholder-muted/60 outline-none transition-colors focus:border-pick"
          />
        </label>
        <button
          type="submit"
          disabled={!email.trim() || busy}
          className="flex items-center gap-2 rounded-md bg-pick px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-pick/85 disabled:cursor-not-allowed disabled:bg-plate disabled:text-muted"
        >
          <UserPlus size={15} />
          Add member
        </button>
      </form>

      <p className="code text-[11px] text-muted">
        {members?.length ?? 0} members · {seated} seated · {free.length} desks free
      </p>

      <ul className="flex flex-col gap-2 pb-6">
        {(members ?? []).map((member) => (
          <li
            key={member.email}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line/60 bg-room px-4 py-3"
          >
            {member.picture ? (
              <img
                src={member.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-ink text-xs font-bold text-muted">
                {(member.name ?? member.email).slice(0, 1).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm text-paper">
                {member.name ?? member.email.split("@")[0]}
                {member.email === me && (
                  <span className="code text-[10px] uppercase text-muted">you</span>
                )}
                {member.role === "admin" && (
                  <span className="code rounded-full border border-pick/50 px-1.5 text-[10px] uppercase text-pick">
                    admin
                  </span>
                )}
              </p>
              <p className="code truncate text-[11px] text-muted">{member.email}</p>
              {!member.signedUp && (
                <p className="text-[11px] text-muted/70">Hasn&rsquo;t signed in yet</p>
              )}
            </div>

            {/* Where they sit, and a way to change it without leaving the list */}
            <label className="flex items-center gap-2">
              <Armchair size={14} className={member.seat ? "text-lit" : "text-muted"} />
              <select
                value={member.seat?.id ?? ""}
                onChange={(e) => onSeat(member.email, e.target.value || null)}
                className="code rounded-md border border-line bg-ink px-2 py-1.5 text-[11px] text-paper outline-none transition-colors focus:border-pick"
              >
                <option value="">no desk</option>
                {member.seat && <option value={member.seat.id}>{member.seat.code}</option>}
                {free.map((desk) => (
                  <option key={desk.id} value={desk.id}>
                    {desk.code}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSetRole(member.email, member.role === "admin" ? "member" : "admin")}
                title={member.role === "admin" ? "Make them a member" : "Make them an admin"}
                className="rounded-md border border-line p-2 text-muted transition-colors hover:border-paper/40 hover:text-paper"
              >
                {member.role === "admin" ? <ShieldOff size={14} /> : <Shield size={14} />}
              </button>
              <button
                type="button"
                onClick={() => onRemove(member.email)}
                title={`Remove ${member.email}`}
                className="rounded-md border border-line p-2 text-muted transition-colors hover:border-red-400/60 hover:text-red-300"
              >
                <UserMinus size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {members?.length === 0 && (
        <p className="text-sm text-muted">Nobody yet. Add the first email above.</p>
      )}
    </div>
  );
}
