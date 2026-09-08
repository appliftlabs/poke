# @applift/poke-server

Reference backend for [Poke](../README.md). Postgres-backed, with Server-Sent-
Events realtime so pins appear live for everyone on the page.

It implements exactly the REST contract Poke's `HttpAdapter` expects. Small
enough to read in one sitting; deploy it as-is for a trusted internal audience,
or fork it to add auth.

## Run it locally

```bash
cd server
npm install

# Postgres — use the bundled compose file, or your own instance
docker compose up -d

# Create the schema
DATABASE_URL=postgres://poke:poke@localhost:5432/poke npm run migrate

# Start (Node 20+ can read .env directly)
cp .env.example .env         # edit POKE_ORIGINS to match your app
node --env-file=.env src/server.js
```

Health check: `curl localhost:4000/health` → `{"ok":true,...}`.

## Point Poke at it

```js
import { init, HttpAdapter } from "@applift/poke";

init({
  // pass `user` if your app has accounts; omit for the name prompt
  adapter: new HttpAdapter({ baseUrl: "http://localhost:4000" }),
});
```

Realtime is automatic — `HttpAdapter` connects to `/pages/:pageId/events` and
reloads on any change.

## Configuration

| Env | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — (required) | `postgres://user:pass@host:5432/poke` |
| `PORT` | `4000` | |
| `POKE_ORIGINS` | `*` | Comma-separated allowed browser origins. Set this. |
| `POKE_PROJECT` | `default` | Namespace for this deployment's comments |
| `POKE_MAX_BODY` | `100000` | Max request body bytes |
| `PGSSL` | auto | `1` force on, `0` off. On by default unless host is localhost. |

## Deploying

Any Node host with a Postgres add-on works — Railway, Fly.io, Render, a VPS.

1. Provision Postgres, set `DATABASE_URL`.
2. Set `POKE_ORIGINS` to your app's real origin(s), e.g.
   `https://app.example.com,https://staging.example.com`.
3. `npm run migrate` once (or let the server's boot-time `ensureSchema` handle
   it — it's idempotent).
4. `npm start`.

Behind a proxy, make sure it doesn't buffer `text/event-stream` (nginx:
`proxy_buffering off` for the events path).

## No auth — what that means

This server trusts the `author` each request carries. That's fine when everyone
who can reach it is someone you'd let comment anyway (a team on a VPN, a staging
site behind SSO at the edge). For a public deployment, put it behind your own
auth and rewrite the `author` server-side from the session in `POST /threads`
and `POST /threads/:id/messages`.
