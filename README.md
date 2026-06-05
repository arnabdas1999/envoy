# Envoy

**End-to-end encrypted environment variable sync for dev teams.**

Stop sharing `.env` files over Slack. One command syncs your secrets across every teammate, environment, and CI pipeline — and the server never sees your values in plaintext.

```bash
npm install -g @arnabdas1999/envoy-cli
envoy login
envoy init        # link your project in 30 seconds
envoy push        # encrypt + upload your .env
envoy pull        # teammate downloads + decrypts locally
```

---

## What it does

Envoy solves the problem every team hits as soon as it grows past one person: _where do the secrets live, and how does everyone get them?_

The common answers are bad ones — a shared Slack message, a password manager note, a `.env.example` with real values committed to git. Envoy replaces all of that with a single CLI command that syncs your `.env` securely, with an audit trail, role-based access, and CI/CD support built in.

### The key difference from other tools

Most secret managers (Doppler, Vault, AWS Secrets Manager) decrypt your secrets server-side and hand them to you. That means you're trusting the vendor with your plaintext values.

Envoy uses **client-side encryption**. Secrets are encrypted on your machine before they leave it. The server stores only ciphertext and has no way to decrypt it — even if the database is compromised, there is nothing useful to steal.

---

## Security model

### How encryption works

```
Master key (256-bit, stored in OS keychain)
      │
      ▼
HKDF-SHA256(
  ikm  = masterKey,
  salt = workspaceSalt,        ← random per workspace, stored in DB (non-secret)
  info = workspaceId:envId:keyName
)
      │
      ▼
Per-secret derived key (256-bit)
      │
      ▼
AES-256-GCM(
  key = derivedKey,
  iv  = random 96-bit (new every encryption),
  aad = environmentId:keyName  ← context binding
)
      │
      ▼
{ ciphertext, iv, authTag }  →  stored on server
```

Every secret gets its own derived key. The HKDF info field binds the key to a specific workspace, environment, and variable name — so deriving `production/DATABASE_URL` never produces the same key as `staging/DATABASE_URL`, even with the same master key.

The AES-GCM Additional Authenticated Data (AAD) goes further: a ciphertext encrypted for `staging` will fail authentication if you try to decrypt it as `production`. There is no silent cross-environment promotion.

### What the server can and cannot see

| Data | Server sees it? | Notes |
|---|---|---|
| Secret **values** | **No** — ciphertext only | The whole point |
| Secret **names** (e.g. `DATABASE_URL`) | Yes | Needed for the web UI listing |
| Who pushed/pulled, when | Yes | Audit trail — by design |
| Master key | **No** — never transmitted | Lives only in your OS keychain |
| Derived keys | **No** — never transmitted | Computed locally per operation |

### Master key model (v1)

When you create a workspace, the CLI generates a random 256-bit master key, shows it to you once, and stores it in your OS keychain (via `keytar` on macOS/Windows/Linux, with a `0600`-permission file fallback). To add a teammate, share the master key out of band (e.g. via your team password manager). This is a deliberate v1 simplification — it mirrors how you'd share any root secret today.

The honest tradeoff: if the master key is leaked, all secrets in that workspace are compromised. Key rotation (`envoy rotate-key`) re-encrypts everything under a new master key. A future v2 would move to per-user keypairs where each member's public key encrypts the secrets independently.

---

## Architecture

The entire stack is JavaScript/TypeScript and deploys to Vercel with no separate backend process.

```
┌─────────────────────────────────┐      ┌──────────────────────────────────────┐
│         envoy-cli               │      │         envoy-web (Vercel)            │
│  (Node 20, TypeScript, npm)     │      │                                       │
│                                 │      │  Next.js 14 App Router                │
│  All crypto runs here.          │      │  ├── /app/...          Web UI         │
│  Master key never leaves.       │      │  └── /api/v1/...       REST API       │
│                                 │      │                                       │
│  envoy push ──HTTPS ciphertext─►│      │  Auth: magic link + JWT (jose)        │
│  envoy pull ◄──────ciphertext───│      │  Rate limiting: Upstash Redis         │
└─────────────────────────────────┘      │  Audit log: every mutation            │
                                         │                                       │
                                         │  ┌─────────────────┐ ┌─────────────┐ │
                                         │  │   Supabase      │ │   Upstash   │ │
                                         │  │   PostgreSQL    │ │   Redis     │ │
                                         │  │   ciphertext    │ │   rate limit│ │
                                         │  │   audit log     │ │   magic link│ │
                                         │  │   version hist  │ │   tokens    │ │
                                         │  └─────────────────┘ └─────────────┘ │
                                         └──────────────────────────────────────┘
```

The CLI calls `/v1/*` on the deployed URL. The Next.js app rewrites those paths to `/api/v1/*` routes, so the same deployment serves both the web UI and the API.

---

## Tech stack

| Layer | Choice |
|---|---|
| CLI | Node 20, TypeScript, `commander`, `tsup`, published to npm |
| Web UI | Next.js 14 App Router, Tailwind CSS |
| API | Next.js API routes (same deployment as web UI) |
| Auth | Magic link email → JWT (`jose`), httpOnly cookie (web) / Bearer token (CLI) |
| Encryption | Node `crypto` — AES-256-GCM + HKDF-SHA256 |
| Key storage | `keytar` (OS keychain) with `~/.envoy/credentials.json` fallback |
| Database | Supabase PostgreSQL (connection pooler for Vercel serverless) |
| Cache / Rate limit | Upstash Redis — sliding window rate limiting + magic link token TTL |
| Email | Resend |
| Hosting | Vercel (web + API), npm (CLI) |

---

## Project structure

```
envoy/
├── envoy-cli/               Node.js CLI (published to npm as @arnabdas1999/envoy-cli)
│   ├── src/
│   │   ├── commands/        One file per command (push, pull, set, get, ...)
│   │   ├── crypto.ts        HKDF + AES-256-GCM implementation
│   │   ├── keystore.ts      OS keychain + file fallback
│   │   ├── config.ts        .envoy.json read/write
│   │   └── lib/             api client, env parser, output helpers
│   └── tests/               16 tests — crypto round-trips, AAD failures, edge cases
│
├── envoy-web/               Next.js app (web UI + API backend)
│   ├── app/
│   │   ├── api/v1/          All REST API routes
│   │   │   ├── auth/        login, verify, me, cli-token, revoke
│   │   │   ├── workspaces/  CRUD, projects, members, invites, audit
│   │   │   ├── projects/    CRUD, environments
│   │   │   ├── environments/CRUD
│   │   │   ├── environments/[id]/secrets/  bulk push/pull + single CRUD + versions
│   │   │   └── memberships/ role change, remove
│   │   ├── (pages)/         dashboard, workspace, secrets view, members, audit
│   │   └── auth/            magic link login + verify pages
│   ├── lib/
│   │   ├── auth-server.ts   JWT verification, cookie management, membership checks
│   │   ├── access.ts        Authorization helpers (requireWorkspaceMember, roleAtLeast)
│   │   ├── audit.ts         Fire-and-forget audit log writer
│   │   ├── rate-limit.ts    Upstash Redis sliding window rate limiter
│   │   ├── redis.ts         Upstash Redis client
│   │   └── db.ts            Postgres connection (Vercel serverless compatible)
│   └── supabase/migrations/ 001_initial_schema.sql — full schema with indexes
│
└── docker-compose.yml       Local dev: Postgres 15 + Redis 7
```

---

## CLI commands

### Authentication

```bash
envoy login                   # magic link → stores 90-day CLI token in OS keychain
envoy logout                  # revokes token on server + clears local credentials
envoy status                  # shows auth state, active workspace/project/env, API reachability
```

### Workspace setup

```bash
envoy workspace create acme   # generates master key (shown once), stores in keychain
envoy workspace list          # list workspaces you belong to
envoy workspace use acme      # switch active workspace (paste master key when prompted)
```

### Project init

```bash
envoy init                              # interactive: select workspace → project → environment
envoy init --workspace acme \
           --project payments-api \
           --env development            # non-interactive (for CI setup scripts)
```

Creates `.envoy.json` in the project root — safe to commit. Contains workspace/project slugs and IDs, no secrets.

### Syncing secrets

```bash
envoy push                    # encrypt .env → upload to active environment
envoy push --env production   # push to a specific environment
envoy push --file .env.local  # use a different source file
envoy push --dry-run          # show diff without writing

envoy pull                    # download + decrypt → overwrite .env
envoy pull --env staging
envoy pull --file .env.local
```

### Individual secret operations

```bash
envoy set DATABASE_URL "postgres://..."   # encrypt + upload one secret
envoy get DATABASE_URL                    # decrypt + print to stdout
envoy remove DATABASE_URL                 # soft-delete (asks for confirmation)
```

### Inspecting

```bash
envoy list                    # secret names in active env (values always masked)
envoy diff                    # compare local .env with remote (names only, no values)
```

### CI and process injection

```bash
envoy inject -- npm run build
# Decrypts secrets into environment variables, runs the command.
# SIGTERM / SIGINT / SIGHUP are forwarded to the child process.
```

### Environment management

```bash
envoy env create staging
envoy env list
envoy env delete staging      # asks for confirmation
```

### Key rotation

```bash
envoy rotate-key
# Generates a new master key, re-encrypts every secret in every environment,
# then displays the new key for distribution to teammates.
```

### Team management

```bash
envoy invite alice@example.com          # adds to workspace, sends invite email
envoy members                           # list members and roles
envoy members role alice@example.com admin
envoy members remove alice@example.com
```

### Audit log

```bash
envoy audit                             # last 50 events
envoy audit --action secret_push        # filter by action type
envoy audit --limit 100
```

---

## The `.envoy.json` file

Created by `envoy init`. Safe to commit — contains no secrets.

```json
{
  "workspace": "acme",
  "workspaceId": "018f2a3b-...",
  "project": "payments-api",
  "projectId": "018f2a3c-...",
  "defaultEnvironment": "development"
}
```

---

## CI / CD

In GitHub Actions, store the workspace master key as a repository secret (`ENVOY_MASTER_KEY`), then pull secrets at build time:

```yaml
- name: Pull secrets
  run: |
    npm install -g @arnabdas1999/envoy-cli
    envoy workspace use acme --key "$ENVOY_MASTER_KEY"
    envoy pull --env production
  env:
    ENVOY_MASTER_KEY: ${{ secrets.ENVOY_MASTER_KEY }}
    ENVOY_API_URL: https://envoy-five.vercel.app

- name: Build
  run: npm run build   # .env now contains decrypted secrets
```

Or use `envoy inject` to avoid writing to disk entirely:

```yaml
- name: Build with injected secrets
  run: envoy inject -- npm run build
  env:
    ENVOY_MASTER_KEY: ${{ secrets.ENVOY_MASTER_KEY }}
    ENVOY_API_URL: https://envoy-five.vercel.app
```

---

## Web UI

The web dashboard at `https://envoy-five.vercel.app` gives your team visibility without the CLI:

- **Dashboard** — list all workspaces and projects
- **Secrets view** — secret names, version numbers, last-updated timestamps, and who pushed them. Values are always shown as `••••••••` — the server cannot decrypt them.
- **Members** — invite teammates, manage roles (owner / admin / member)
- **Audit log** — every push, pull, delete, invite, and key rotation, with actor email, timestamp, and IP address. Filterable by action type.

---

## Local development

**Prerequisites:** Node 20, Docker (or a Supabase project + Upstash Redis)

```bash
# 1. Start Postgres + Redis locally
docker compose up -d

# 2. Set up the web app
cd envoy-web
cp .env.local.example .env.local
# Edit .env.local — fill in all required values (see table below)
psql "$POSTGRES_URL" -f supabase/migrations/001_initial_schema.sql
npm install
npm run dev          # http://localhost:3000

# 3. Build the CLI (separate terminal)
cd envoy-cli
npm install
npm run build
npm link             # makes 'envoy' available globally

# 4. Point the CLI at your local server
export ENVOY_API_URL=http://localhost:3000   # Linux/macOS
$env:ENVOY_API_URL = "http://localhost:3000" # Windows PowerShell
```

### Required environment variables (`envoy-web/.env.local`)

| Variable | Description |
|---|---|
| `POSTGRES_URL` | Supabase connection pooler URL (port 6543, Transaction mode) |
| `NEXT_PUBLIC_APP_URL` | App base URL (`http://localhost:3000` in dev) |
| `JWT_SECRET` | 64-byte random hex — `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key — prefix `re_test_` logs links to console instead of sending |
| `RESEND_FROM` | Sender address (use `onboarding@resend.dev` for testing) |
| `UPSTASH_REDIS_REST_URL` | [Upstash](https://upstash.com) Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

---

## Deploying to Vercel

1. Push the repo to GitHub and import into a new Vercel project. Set **Root Directory** to `envoy-web` and **Framework** to Next.js.

2. Create a free [Supabase](https://supabase.com) project. Go to **SQL Editor** and run the full contents of `envoy-web/supabase/migrations/001_initial_schema.sql`. Get the **Transaction pooler** connection string from **Settings → Database** (port 6543).

3. Create a free [Upstash](https://upstash.com) Redis database. Copy the REST URL and token.

4. Add environment variables in the Vercel dashboard:

| Variable | Value |
|---|---|
| `POSTGRES_URL` | Supabase Transaction pooler URI |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL |
| `JWT_SECRET` | 64-byte random hex string |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) |
| `RESEND_FROM` | Your verified sender address |
| `UPSTASH_REDIS_REST_URL` | From Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash dashboard |

5. Deploy. Vercel auto-deploys on every push to `main`.

---

## How Redis is used

Upstash Redis serves two purposes:

**1. Distributed rate limiting** — using `@upstash/ratelimit` with sliding window algorithm, shared across all Vercel serverless instances:
- Auth endpoints: 5 requests/min per IP
- Write endpoints: 20 requests/min per IP
- Read endpoints: 60 requests/min per IP

**2. Magic link token storage** — tokens are stored in Redis with a 5-minute TTL instead of the database. The verify endpoint uses `GETDEL` for atomic single-use consumption — a token can only be used once even under concurrent requests.

---

## Database schema (overview)

The full schema is in [`envoy-web/supabase/migrations/001_initial_schema.sql`](envoy-web/supabase/migrations/001_initial_schema.sql).

| Table | Purpose |
|---|---|
| `workspaces` | Team namespace; holds `workspace_salt` for HKDF and `master_key_hash` for integrity |
| `users` | Email-only accounts; `is_service_account` flag for CI tokens |
| `auth_tokens` | Long-lived CLI tokens (hashed, 90-day expiry, revocable) |
| `memberships` | Many-to-many users ↔ workspaces with `CHECK (role IN ('owner','admin','member'))` |
| `projects` | A repo / app within a workspace |
| `environments` | Named env per project (`development`, `staging`, `production`, …) |
| `secrets` | Current ciphertext values — `deleted_at` soft-delete, partial unique index |
| `secret_versions` | Immutable history: every previous value before an overwrite |
| `audit_log` | Append-only record of every mutation — `ON DELETE SET NULL` preserves logs |

---

## API reference (summary)

All routes at `/v1/` (CLI) or `/api/v1/` (internal). Bearer token or `httpOnly` cookie auth.

```
POST  /v1/auth/login                       Send magic link (token stored in Redis, 5-min TTL)
POST  /v1/auth/verify                      Exchange token → JWT (atomic GETDEL from Redis)
POST  /v1/auth/cli-token                   Issue 90-day CLI token (JWT, hash stored in DB)
POST  /v1/auth/tokens/revoke               Revoke a CLI token
GET   /v1/auth/me                          Current user

GET   /v1/workspaces                       List user's workspaces
POST  /v1/workspaces                       Create workspace
GET   /v1/workspaces/:id                   Workspace detail
DELETE /v1/workspaces/:id                  Delete (owner only)
GET   /v1/workspaces/:id/projects          List projects
POST  /v1/workspaces/:id/projects          Create project
GET   /v1/workspaces/:id/members           List members
POST  /v1/workspaces/:id/invites           Invite a user
GET   /v1/workspaces/:id/audit             Audit log (cursor-paginated, filterable)

GET   /v1/projects/:id                     Project detail
DELETE /v1/projects/:id                    Delete project
GET   /v1/projects/:id/environments        List environments
POST  /v1/projects/:id/environments        Create environment

GET   /v1/environments/:id                 Environment detail + ETag header
DELETE /v1/environments/:id               Delete environment
GET   /v1/environments/:id/secrets         Pull all secrets (ciphertext)
PUT   /v1/environments/:id/secrets         Push all secrets (transactional, If-Match ETag)
GET   /v1/environments/:id/secrets/:key    Get single secret
PUT   /v1/environments/:id/secrets/:key    Set single secret
DELETE /v1/environments/:id/secrets/:key   Soft-delete secret
GET   /v1/environments/:id/secrets/:key/versions  Version history

PATCH  /v1/memberships/:id                 Change role
DELETE /v1/memberships/:id                 Remove member

GET   /health                              DB liveness check
```

Errors always return `{"error": {"code": "SNAKE_CASE_CODE", "message": "Human-readable message"}}`.

Concurrent push protection: `PUT /v1/environments/:id/secrets` requires an `If-Match` header matching the environment's ETag. A stale ETag returns `412 Precondition Failed` — run `envoy pull` first.

---

## Frequently asked questions

**Can you read my secrets?**
No. The server stores only ciphertext. The master key lives in your OS keychain and is never transmitted. You can verify this by querying the database directly — every `ciphertext` column contains base64-encoded encrypted bytes with no way to reverse them without your key.

**What if I lose the master key?**
In v1, secrets are unrecoverable — by design. This is the same guarantee as any encrypted volume: without the key, the data is gone. Keep a backup of the master key in your team password manager (1Password, Bitwarden, etc.).

**How is this different from Doppler / Vault / AWS Secrets Manager?**
Those tools decrypt server-side and hand you plaintext. Envoy decrypts only on the client. The tradeoff: you manage one key per workspace rather than having a hosted key management service. Envoy is simpler, free for small teams, and gives you a stronger privacy guarantee.

**Why not just use `sops` or `age`?**
Those are great for single-user or file-based workflows. Envoy adds team sync, web-based visibility, an audit trail, and CI integration without requiring GPG setup or manual key distribution beyond the initial master key share.

**Is this production-ready?**
The cryptography is solid (AES-256-GCM with HKDF, AAD context binding, random IVs per encryption). The API has distributed rate limiting via Redis, ETag concurrency control, soft deletes, and an immutable audit trail. That said, this is a v1 — start with non-production environments and review the code before trusting it with critical secrets.

**Self-hosting?**
Clone the repo, run `docker compose up -d`, apply the migration, fill in `.env.local`, and run `npm run dev` in `envoy-web/`. Set `ENVOY_API_URL` to your host in the CLI.

---

## Contributing

```bash
# Run tests
cd envoy-cli && npm test        # 16 unit tests (crypto + env parser)
cd envoy-web && npm run typecheck

# Build
cd envoy-cli && npm run build
cd envoy-web && npm run build
```

CI runs on every push via `.github/workflows/ci.yml` — runs CLI tests and web typecheck + build.
