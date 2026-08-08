# Running and deploying the office

State lives in Postgres. The container is disposable — nothing is kept on
its disk — so Render can restart or redeploy it freely.

The server is NestJS over TypeORM; the schema is owned by migrations, which
run on boot. The page, the REST API and the WebSocket all share one port.

## Configuration

| Variable           | What it is                                                          |
| ------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`     | Postgres connection string. Required — the server exits without it   |
| `GOOGLE_CLIENT_ID` | OAuth web client id. Without it, Google sign-in is off (see below)   |
| `SESSION_SECRET`   | What session tokens are signed with. Set it, or restarts sign people out |
| `PORT`             | Optional; defaults to 3001. Render sets this itself                  |
| `DATABASE_SSL`     | Force TLS for a non-`*.render.com` host that needs it                |

Render gives two connection strings for the same database:

- **internal** (`…@dpg-xxxx-a/dbname`) — from inside Render. Faster, no TLS.
- **external** (`…@dpg-xxxx-a.oregon-postgres.render.com/dbname`) — from
  anywhere else. TLS is turned on automatically for this hostname.

Copy `.env.example` to `.env` and put the external URL there. `.env` is
gitignored; the credentials must never be committed.

## Signing in

People sign in with Google. The browser gets an ID token, the server checks
it against Google's public keys, and hands back a session of its own — so
there is no client secret anywhere, and `GOOGLE_CLIENT_ID` is safe to ship
in the frontend bundle.

In the Google Cloud console, create an OAuth client of type **Web
application** and add these to **Authorized JavaScript origins**:

```
http://localhost:5173                 # Vite, in development
http://localhost:3001                 # the server, serving the built page
https://your-app.onrender.com         # production
```

Leave **Authorized redirect URIs** empty — this flow doesn't use them. On
the consent screen, `openid`, `email` and `profile` are the only scopes
needed.

Google rejects plain `http://` origins for anything but `localhost`, so
opening the dev server on a LAN address (`192.168.x.x:5173`) won't sign in.

**Without a client id**, the server opens a development door instead: type
any email on the sign-in page and you are that person. It is refused
outright when `NODE_ENV=production`, which the Docker image sets.

## Who can do what

- Anyone signed in can **create an office**, and is its admin.
- An admin edits the floor plan and keeps the **member list**, which is a
  list of emails — added before those people have ever signed in.
- Seating is assigned: a member walks in only if the admin has given their
  email a desk. Take the desk away and they are shown the door.

## Locally, without Docker

```bash
pnpm install
pnpm dev          # Vite on :5173, the server on :3001
```

The page is served by Vite and talks to the server on `:3001`. Migrations
run on first connect.

## Locally, in Docker (the same image Render runs)

```bash
docker compose up --build
```

Then open <http://localhost:3001>. One container, reading `.env`, talking to
the Render database over the external URL. Expect it to feel slower than
production — every query crosses the Atlantic; inside Render it won't.

## On Render

The blueprint in `render.yaml` describes a single Docker web service. The
database is not declared there, because it already exists.

1. Push this branch to GitHub.
2. In Render: **New → Blueprint**, pick the repo. It reads `render.yaml`.
3. When prompted, paste the **internal** `DATABASE_URL` of the existing
   database and the `GOOGLE_CLIENT_ID` from the console. `SESSION_SECRET`
   is generated for you.
4. Deploy. Migrations run on boot; an office is created by whoever signs in
   first and makes one.

Render's health check hits `/healthz`.

### Migrations

They run automatically on boot (`migrationsRun`). To drive them by hand:

```bash
pnpm --filter backend migration:run
pnpm --filter backend migration:revert
```

### Notes on the free plan

A free web service sleeps after ~15 minutes idle and takes a few seconds to
wake, which drops everyone's WebSocket. A free Postgres instance expires
after 30 days. Neither is a code problem, but both will look like one.

### Running more than one instance

Don't, yet. Huddles and the list of who is online are held in the process's
memory, so two instances would each see half of every office. Postgres holds
the durable state; the live session state does not survive being split.
