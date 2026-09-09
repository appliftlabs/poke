# @appliftlabs/poke-server

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
import { init, HttpAdapter } from "@appliftlabs/poke";

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
| `POKE_ORIGINS` | `*` | Allowed browser origins (see below). Set this. |
| `POKE_PROJECT` | `default` | Namespace for this deployment's comments |
| `POKE_MAX_BODY` | `100000` | Max request body bytes |
| `PGSSL` | auto | `1` force on, `0` off. On by default unless host is localhost. |

### `POKE_ORIGINS`

Comma-separated. Each entry is one of:

| Entry | Matches |
|---|---|
| `*` | any origin — only for internal / trusted-network use |
| `https://app.example.com` | that exact origin |
| `https://*.example.com` | any single-label subdomain (`a.example.com`, not `a.b.example.com`); the scheme must match too |

Include scheme and port. For a multi-tenant app with per-customer subdomains:

```
POKE_ORIGINS=https://app.modools.app,https://*.modools.app
```

## Deploying

The server needs a public URL your app can reach. `Dockerfile`, `railway.json`,
and `docker-compose.prod.yml` are included.

### Railway

```bash
npm i -g @railway/cli
railway login

cd server
railway init                       # create a project
railway add --database postgres    # provisions Postgres, injects DATABASE_URL
railway variables --set 'POKE_ORIGINS=https://your-app.com' --set 'POKE_PROJECT=your-app'
railway up                         # builds the Dockerfile, deploys
railway domain                     # get the public URL
```

`railway.json` sets the health check to `/health`. `DATABASE_URL` comes from the
Postgres plugin automatically; you only set `POKE_ORIGINS` (and optionally
`POKE_PROJECT`).

### Fly.io

```bash
cd server
fly launch --no-deploy             # generates fly.toml from the Dockerfile
fly postgres create                # then: fly postgres attach <name>
fly secrets set POKE_ORIGINS=https://your-app.com POKE_PROJECT=modools
fly deploy
```

### Self-host (Docker)

```bash
POKE_ORIGINS=https://your-app.com POSTGRES_PASSWORD=$(openssl rand -hex 16) \
  docker compose -f docker-compose.prod.yml up -d
```

Runs the server + its own Postgres. Put a TLS proxy (Caddy / nginx / Traefik) in
front of `:4000`.

### Any host — the essentials

1. Provision Postgres, set `DATABASE_URL` (managed Postgres needs SSL — the
   server auto-enables it for non-localhost hosts).
2. Set `POKE_ORIGINS` to your app's exact origin(s), comma-separated:
   `https://app.applift.xyz,https://staging.applift.xyz`.
3. Deploy. The schema is created on boot (`ensureSchema`, idempotent); run
   `npm run migrate` explicitly if you prefer.

Behind a proxy, don't buffer `text/event-stream` — the SSE stream at
`/pages/:pageId/events` needs to flush immediately (nginx: `proxy_buffering off`
for that path; Caddy does the right thing by default).

## No auth — what that means

This server trusts the `author` each request carries. That's fine when everyone
who can reach it is someone you'd let comment anyway (a team on a VPN, a staging
site behind SSO at the edge). For a public deployment, put it behind your own
auth and rewrite the `author` server-side from the session in `POST /threads`
and `POST /threads/:id/messages`.
