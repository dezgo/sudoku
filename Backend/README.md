# Sudoku Backend

Cloudflare Workers backend for the cross-platform Sudoku app. Hosts identity (email OTP), groups, the canonical daily puzzle, and (Phase 2) leaderboard scores.

Behavioural contract: [`../SPEC.md` §17](../SPEC.md). The Worker is the source of truth — both apps fetch the daily from here, so iOS and Android always see the same puzzle.

## Stack

- **Cloudflare Workers** (TypeScript) — HTTP entry + hourly cron.
- **Cloudflare D1** (SQLite) — `users`, `auth_codes`, `auth_tokens`, `daily_puzzles`, `groups`, `group_members`, `scores`.
- **Resend** — OTP email delivery from `noreply@appfoundry.cc`.
- **Custom domain**: `sudoku.appfoundry.cc`.

## Layout

```
Backend/
├── wrangler.toml              # Worker config (D1 binding, cron, custom domain)
├── package.json
├── tsconfig.json
├── migrations/
│   └── 0001_init.sql          # 7-table schema
└── src/
    ├── index.ts               # Router entry + scheduled handler
    ├── auth.ts                # OTP flow + bearer middleware
    ├── me.ts                  # /v1/me, /v1/me/groups
    ├── groups.ts              # /v1/groups, join, members, leave
    ├── daily.ts               # /v1/daily/today, /v1/daily/:id, cron
    ├── generator.ts           # Sudoku generator + MRV solver (port of SPEC §6)
    ├── email.ts               # Resend wrapper
    ├── http.ts                # JSON helpers
    ├── crypto.ts              # token / OTP / invite-code generation, sha256
    └── types.ts               # Env, User, Group, Puzzle, Grid
```

## First-time setup

These steps assume you have a Cloudflare account, the `appfoundry.cc` zone in that account, and Node 18+ locally.

1. **Install dependencies.**
   ```
   cd Backend
   npm install
   ```

2. **Create the D1 database.**
   ```
   npm run db:create
   ```
   This prints a `database_id`. Paste it into `wrangler.toml`, replacing `REPLACE_WITH_OUTPUT_OF_db:create`.

3. **Apply the schema (locally, then remotely).**
   ```
   npm run db:migrate:local      # for `wrangler dev`
   npm run db:migrate:remote     # for production
   ```

4. **Set the Resend API key as a secret.**
   ```
   npx wrangler secret put RESEND_API_KEY
   ```
   Paste the key when prompted.

5. **Verify the `noreply@appfoundry.cc` sender domain in Resend.** Add the SPF / DKIM / DMARC records Resend gives you to the `appfoundry.cc` zone in Cloudflare. Without these, the OTP email will be rejected by most inboxes.

6. **Deploy.**
   ```
   npm run deploy
   ```
   On the first deploy, Wrangler will try to bind `sudoku.appfoundry.cc` as a Custom Domain for the Worker. If a manual A/CNAME record for that subdomain already exists in Cloudflare DNS, the deploy will fail with a clear conflict — delete the manual record (Cloudflare manages the record itself for Custom Domains), then re-run `npm run deploy`.

7. **Smoke-test.**
   ```
   curl https://sudoku.appfoundry.cc/                       # → "sudoku-api ok"
   curl https://sudoku.appfoundry.cc/v1/daily/today | jq    # → today + tomorrow puzzles
   curl -X POST https://sudoku.appfoundry.cc/v1/auth/start \
        -H 'content-type: application/json' \
        -d '{"email":"you@example.com"}'                    # → 204, email arrives
   ```

## Local development

```
npm run dev
```

`wrangler dev` runs the Worker locally with the D1 binding pointed at the local SQLite copy. Routes that send email won't actually email unless you set `RESEND_API_KEY` in `.dev.vars` and use a verified sender — for OTP flow testing, tail the Worker logs and read the code from there, or check Resend's dashboard for sandbox sends.

## Phase scope

- **Phase 1 (deployed and validated 2026-04-29)**: identity (`/v1/auth/start`, `/v1/auth/verify`), me (`/v1/me`, `/v1/me/groups` — returns `invite_code` per group so any member can recover the join code), groups (`/v1/groups`, `/v1/groups/join`, `/v1/groups/:id/members`, `DELETE /v1/groups/:id/members/me`), daily (`/v1/daily/today` returns today + tomorrow, `/v1/daily/:puzzle_id`), and the hourly cron that pre-generates today + tomorrow's puzzles. The `scores` table exists in the schema so Phase 2 is purely additive.
- **Phase 2**: `POST /v1/scores` and `GET /v1/groups/:id/scores/:puzzle_id`, plus the iOS/Android leaderboard view + pending-scores queue.
- **Phase 2.5**: `username` column on `users` + `group_invites` table; user search + invite-by-username + invite-by-email endpoints; pending-invites UI.
- **Phase 3**: async buddy progress (`POST /v1/me/progress`).
- **Phase 4**: live realtime co-op / competitive via Cloudflare Durable Objects + WebSockets.

See [`../SPEC.md` §17.6](../SPEC.md) for the full deferred-feature list and [`../STATUS.md`](../STATUS.md) for the current top-level status.

## Cost notes

At a friends-group scale, every component is comfortably within the free tier:

- Workers Free: 100k requests/day. With ~10 friends opening the app a few times each, daily traffic is in the low hundreds.
- D1 Free: 5GB storage, 5M reads/day. Schema is tiny (one row per user, one row per daily, etc.).
- Resend Free: 3,000 emails/month, 100/day. Sign-ins are rare (token never expires); sustained burn is near zero.
- Cron Triggers: included with Workers Free.

The one thing that could push past the free CPU-time limit is daily generation on a cold cache. Carving a Medium puzzle takes ~50–200ms of CPU. The hourly cron pre-generates today + tomorrow so the user-facing path always reads from D1 — but if you ever need headroom, Workers Paid ($5/mo) raises CPU per request from 10ms to 30s.
