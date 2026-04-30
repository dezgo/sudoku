# Sudoku — Project Status

_Last updated: 2026-04-30_

Two platforms (iOS + Android) targeting the same behavioural contract in [`SPEC.md`](SPEC.md), backed by a small Cloudflare Workers backend.

| Layout | Contents |
|---|---|
| [`SPEC.md`](SPEC.md) | Platform-agnostic spec (data model, rules, screens, persistence, daily, generator, identity, groups, leaderboards, API contract). The canonical contract that both apps and the backend follow. |
| [`iOS/`](iOS/) | SwiftUI app. See [`iOS/STATUS.md`](iOS/STATUS.md) for the implementation map. |
| [`Android/`](Android/) | Jetpack Compose app. See [`Android/README.md`](Android/README.md) for build instructions and source layout. |
| [`Backend/`](Backend/) | Cloudflare Workers backend (TypeScript + D1 + Resend). Hosts identity, groups, daily distribution, scores. See [`Backend/README.md`](Backend/README.md) for deploy steps. |

## Where things stand

**Phase 1 (identity + groups + cross-platform daily) is shipped and validated end-to-end.** Friends can sign in via email OTP on either platform, create / join groups via 6-character codes, and both apps fetch the same daily puzzle from `sudoku.appfoundry.cc`. Cross-platform identical-daily proven on 2026-04-29 by playing the same `20260429` puzzle on iOS and Android with two different users in one group.

### What works
- **iOS** networking + sign-in / group-onboarding sheets shipped. Daily fetched from server with offline-fallback to local generator (marked unranked). Token in Keychain. Groups + daily caches in UserDefaults. Foreground refresh keeps groups in sync.
- **Android** networking + sign-in / group-onboarding sheets shipped. Same offline-fallback model. Token in EncryptedSharedPreferences. Groups + daily caches in DataStore. Lifecycle observer refreshes daily + groups on `ON_RESUME` / `ON_START`.
- **Backend** deployed at `sudoku.appfoundry.cc`. All Phase 1 endpoints live (auth start/verify, me get/put + groups, groups create/join/members/leave, daily today + by-id). Hourly cron pre-generates today + tomorrow's puzzle so user-facing requests just read from D1. Resend domain verified, OTP emails landing in inboxes. `/v1/me/groups` returns `invite_code` per group so any member can recover the code.

### What's NOT yet implemented (so a future Claude doesn't go looking)
- Score POST + leaderboard endpoints + leaderboard view in either app (Phase 2).
- Pending-scores queue *infrastructure exists locally as `sudoku.pending_scores.v1` storage key, but nothing reads/writes it yet*.
- Username field on users; invite-by-username; invite-by-email; pending-invites UI (Phase 2.5).
- Live realtime co-op / competitive (Phase 4).
- Per-group timezone (currently global Sydney).
- Cross-session Undo persistence; per-tier dailies; rule-vs-solution mistake toggle.

## Roadmap

1. **Phase 2 — Leaderboards** (next). Add `POST /v1/scores` and `GET /v1/groups/:id/scores/:puzzle_id` to the Worker. iOS + Android post on solve, render a per-group leaderboard sheet, queue offline scores in `sudoku.pending_scores.v1`. This is the visible payoff for the social model.
2. **Phase 2.5 — Better invite UX.** Add `username` (unique, lowercase, separate from `display_name`) to users; add `group_invites` table; add user-search + invite-by-username endpoints; show pending invites on home; optional invite-by-email path via Resend. Replaces invite codes as the primary onboarding flow but keeps codes as a fallback.
3. **Distribution.** TestFlight (iOS, requires $99/yr Apple Developer Program) + Play internal-test (Android, free) for the friend group.
4. **Phase 3 — Async buddy progress.** Periodic `POST /v1/me/progress` during play; "Alice is 47/81 at 03:12" surfaced on the leaderboard view.
5. **Phase 4 — Realtime co-op / competitive.** Cloudflare Durable Objects + WebSockets; room key = match_id (UUID), independent of group_id.
6. **Polish bucket.** Per-group timezone, solution vs rule mistake toggle, cross-session Undo, per-tier dailies.

## Decisions already made (don't re-litigate in a new session)

- **Identity**: email + 6-digit OTP. Not Apple Sign-In, not Google Sign-In, not Game Center / Play Games (cross-platform lock-in rejected).
- **Backend**: Cloudflare Workers + D1 + Resend. Not Firebase, not Supabase. User has a Cloudflare account and uses CF heavily.
- **Daily generation**: server-side, generated once per `(date, difficulty)` and cached in D1. Not "stricter deterministic cross-platform generator" — too fragile.
- **Daily timezone**: global `Australia/Sydney` for v1. Per-group TZ is deferred (one-column ALTER + API param when needed).
- **Social primitive**: groups (multi-group per user). Not "all friends in one bucket".
- **Anonymous reads** of `/daily/today` allowed; only score/progress POSTs require auth.
- **Pending-score migration**: anonymous solves get posted on first authenticated request after sign-in.
- **Token storage**: Keychain (iOS) / EncryptedSharedPreferences (Android). `androidx.security:security-crypto:1.1.0-alpha06` (alpha; current best option).
- **Realtime stack** (when added): Cloudflare Durable Objects + WebSockets. Same account, no new infra.
- **Distribution channels**: TestFlight (iOS), Play internal-test (Android). Not public app store.

## Operational notes

- **Backend URL**: `https://sudoku.appfoundry.cc/v1`. Worker name `sudoku-api`. Custom-domain bound via `wrangler.toml` `routes` with `custom_domain = true`.
- **D1 database**: name `sudoku`. Schema in `Backend/migrations/0001_init.sql` (7 tables: `users`, `auth_codes`, `auth_tokens`, `daily_puzzles`, `groups`, `group_members`, `scores` — last is empty until Phase 2).
- **Resend domain**: `appfoundry.cc`, sender `noreply@appfoundry.cc`. SPF/DKIM/DMARC records added in Cloudflare DNS for the zone.
- **Cron**: hourly `0 * * * *`, idempotent — ensures today + tomorrow's daily puzzles exist in D1.
- **Recover an invite code from D1** (until the in-app display ships):
  ```bash
  cd Backend && npx wrangler d1 execute sudoku --remote --command "SELECT name, invite_code FROM groups"
  ```
- **Build prerequisite for Android CLI**: `JAVA_HOME` must point at Android Studio's bundled JDK (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`) or any JDK 17. Otherwise `./gradlew` fails with "unable to locate a Java runtime".
- **Workers Free tier note**: 10ms CPU per request. Daily generation is too slow for that, but the cron pre-generates so the user-facing read path is fast (microseconds). If the cron starts failing under load, upgrade to Workers Paid ($5/mo) for 30s CPU.
- **iOS edge case**: dailies completed *before* the backend was deployed (early on 2026-04-29) are locally-generated and don't match the server puzzle for the same date. Clearing completed history (Games sheet → Clear) on iOS lets you re-fetch today's daily fresh. Going forward, both platforms always fetch from server first.

## Working with this project (continuing in a new Claude session)

For a fresh Claude session, read in this order:
1. **`SPEC.md`** — canonical behaviour contract (data model, rules, screens, identity, groups, leaderboards, API). Source of truth.
2. **`STATUS.md`** (this file) — what exists, what's pending, what's been decided.
3. **`iOS/STATUS.md`** or **`Android/README.md`** — implementation maps for whichever side you're touching.
4. **`Backend/README.md`** — deploy + first-time setup.
5. **Auto-memory** at `~/.claude/projects/-Users-derek-Projects-Sudoku/memory/` — persistent decisions, dual-platform workflow rule, user preferences. Loaded automatically.

Two rules that always apply:
- **Dual-platform mirror.** Any behavioural change to one app must be reflected in the other *and* in `SPEC.md`, in the same response. See `feedback_dual_platform_workflow.md` in memory.
- **Personal email default for personal projects.** Don't auto-fill the user's work email (`derek@watsonblinds.com.au`) into test commands or sign-up flows; ask or use a placeholder. See `feedback_personal_email.md` in memory.
