# Running and deploying the office

State lives in Postgres. The container is disposable — nothing is kept on
its disk — so Render can restart or redeploy it freely.

## Configuration

One variable does the work:

| Variable       | What it is                                                        |
| -------------- | ----------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string. Required — the server exits without it |
| `PORT`         | Optional; defaults to 3001. Render sets this itself                |
| `DATABASE_SSL` | Force TLS for a non-`*.render.com` host that needs it              |

Render gives two connection strings for the same database:

- **internal** (`…@dpg-xxxx-a/dbname`) — from inside Render. Faster, no TLS.
- **external** (`…@dpg-xxxx-a.oregon-postgres.render.com/dbname`) — from
  anywhere else. TLS is turned on automatically for this hostname.

Copy `.env.example` to `.env` and put the external URL there. `.env` is
gitignored; the credentials must never be committed.

## Locally, without Docker

```bash
pnpm install
pnpm dev          # Vite on :5173, backend on :3001
```

In development the page is served by Vite and talks to the backend on
`:3001`. Tables are created and the office seeded on first connect.

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
3. When prompted for `DATABASE_URL`, paste the **internal** connection
   string of the existing database.
4. Deploy. First boot creates the tables and seeds the office if the
   database is empty; an existing database is left exactly as it is.

The service serves the page, the REST API and the WebSocket on one port, so
there is nothing else to wire up and the socket rides the same TLS
certificate as the page (`wss://`).

Render's health check hits `/healthz`.

### Notes on the free plan

A free web service sleeps after ~15 minutes idle and takes a few seconds to
wake, which drops everyone's WebSocket. A free Postgres instance expires
after 30 days. Neither is a code problem, but both will look like one.

### Running more than one instance

Don't, yet. Huddles and the list of who is online are held in the process's
memory, so two instances would each see half the office. Postgres holds the
durable state; the live session state does not survive being split.
