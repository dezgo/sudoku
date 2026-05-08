# Sudoku — Project Status

_Last updated: 2026-05-05_

Two platforms (iOS + Android) targeting the same behavioural contract in [`SPEC.md`](SPEC.md), backed by a small Cloudflare Workers backend.

| Layout | Contents |
|---|---|
| [`SPEC.md`](SPEC.md) | Platform-agnostic spec (data model, rules, screens, persistence, daily, generator, identity, groups, leaderboards, API contract). The canonical contract that both apps and the backend follow. |
| [`iOS/`](iOS/) | SwiftUI app. See [`iOS/STATUS.md`](iOS/STATUS.md) for the implementation map. |
| [`Android/`](Android/) | Jetpack Compose app. See [`Android/README.md`](Android/README.md) for build instructions and source layout. |
| [`Backend/`](Backend/) | Cloudflare Workers backend (TypeScript + D1 + Resend). Hosts identity, groups, daily distribution, scores. See [`Backend/README.md`](Backend/README.md) for deploy steps. |

## Where things stand

**Phases 1, 2, and Multiplayer v3 are code-complete.** Backend deployed at `sudoku.appfoundry.cc` with 4 new multiplayer tables + 10 new endpoints. Both apps wired end-to-end. Push notifications scaffolded (APNs JWT signing, FCM JWT signing) — APNs is wired pending secret values, FCM pending Firebase project setup. Public store releases shipping in flight.

### What works
- **iOS** networking + sign-in / group-onboarding sheets shipped. Daily fetched from server with offline-fallback to local generator (marked unranked). Token in Keychain. Groups + daily + pending-scores caches in UserDefaults. Foreground refresh keeps groups in sync. Score POSTed on canonical-daily solves; offline solves queued and flushed on launch / sign-in. Leaderboard sheet (top 10 + own row pinned, group picker for 2+ groups) reachable from Home and from the Solved fanfare.
- **Android** networking + sign-in / group-onboarding sheets shipped. Same offline-fallback model. Token in EncryptedSharedPreferences. Groups + daily + pending-scores caches in DataStore. Lifecycle observer refreshes daily + groups on `ON_RESUME` / `ON_START`. Same Phase 2 wiring as iOS (post on solve, queue + flush, leaderboard sheet).
- **Backend** deployed at `sudoku.appfoundry.cc`. All Phase 1 + Phase 2 endpoints live (auth start/verify, me get/put + groups, groups create/join/members/leave, daily today + by-id, **scores POST**, **groups/:id/scores/:puzzle_id**). Hourly cron pre-generates today + tomorrow's puzzle so user-facing requests just read from D1. Resend domain verified. `/v1/me/groups` returns `invite_code` per group. Score POST is idempotent via composite PK `(user_id, puzzle_id)` so the offline-queue retry is safe.

### What's NOT yet implemented (so a future Claude doesn't go looking)
- Username field on users; invite-by-username; invite-by-email; pending-invites UI (Phase 2.5).
- Per-group timezone (currently global Sydney).
- Cross-session Undo persistence; per-tier dailies; rule-vs-solution mistake toggle.
- **Cross-device daily-save sync (Phase 2 of progress sync)** — Phase 1 (history pull on sign-in via `GET /v1/me/scores`) lands in this session. Phase 2 needs a `daily_saves` D1 table + `POST/GET/DELETE /v1/me/daily_saves/...` endpoints + write-on-save logic in clients so a user can start the daily on phone and finish on iPad.
- **FCM (Android push)** — JWT scaffolding deployed but no Firebase project yet. Add: Firebase Console → create project → add Android app `com.derekgillett.sudoku` → download `google-services.json` to `Android/app/` → wire FCM SDK + FirebaseMessagingService. Then set `FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY` Worker secrets.
- **iOS push deep-link handler** — pushes have a `kind` + `game_id` payload but tapping a notification currently just opens the app, not the specific game. Need `UNUserNotificationCenterDelegate` routing.
- **App Links: Play-Store cert SHA256** still needs to be appended to `Backend/src/well-known.ts` once available from Play Console → App integrity → App signing key certificate. Until that's added + redeployed, App Links verification fails for installs from the Play Store production track (sideloaded / Internal-track installs already work via the local-keystore SHA already listed).
- **Multiplayer hand-crafted Coach scenarios for harder techniques** — Coach Mode ships 7 of 14. Hidden Triple, X-Wing, XY-Wing, Swordfish, Naked Quad, Hidden Quad, Jellyfish need boards where the target fires as the first useful `findHint` move.
- **Tutor: chain-reasoning techniques** — engine has 21 pattern-based techniques. Hard puzzles needing forcing chains / simple coloring / X-cycles / XY-chains still bottom out the engine. Adding chain reasoning is its own architectural lift (graph-walking strong/weak links).

## Pending rebuilds

Phase 2 backend is deployed; the apps are not yet running the new code:

1. Rebuild iOS in Xcode — picks up the leaderboard sheet, post-on-solve, and pending-queue flush.
2. Rebuild Android in Studio — same. (Verified to compile cleanly via `./gradlew compileDebugKotlin`.)

## Roadmap

1. **Cross-device sync — Phase 2 (next session).** New `daily_saves` D1 table + `POST/GET/DELETE /v1/me/daily_saves/:puzzle_id` endpoints. Clients push on every save persist, pull on sign-in / app launch, delete on solve. Conflict rule: server's `updated_at` wins, but local elapsed > remote elapsed prefers local (assume mid-solve). Unlocks "start on phone → finish on iPad" story.
2. **FCM / Android push.** Firebase project setup, `google-services.json` + SDK wiring + FirebaseMessagingService. ~1-2 hours once Firebase project is created.
3. **iOS push deep-linking.** UNUserNotificationCenterDelegate that reads `kind` + `game_id` from notification payload and navigates into the matching game / lobby tab.
4. **Magic-link sign-in path** alongside the OTP code in the email — for Gmail / Outlook users where iOS Mail autofill doesn't work, tapping the link in the email is the autofill equivalent. iOS Mail users still get OTP autofill via `.textContentType(.oneTimeCode)` on the code field (already wired). Now that AASA + assetlinks are deployed for the multiplayer flow, the same Universal-Link plumbing can carry magic-link tokens — extend AASA `paths` to include `/auth/*`.
5. **Phase 2.5 — Better invite UX.** Add `username` (unique, lowercase, separate from `display_name`) to users; add `group_invites` table; user-search + invite-by-username endpoints. Replaces invite codes as the primary onboarding flow but keeps codes as a fallback.
6. **Coach Mode — remaining 7 scenarios.** Hand-craft boards for Hidden Triple, X-Wing, XY-Wing, Swordfish, Naked Quad, Hidden Quad, Jellyfish where the target technique fires as the first useful `findHint` move.
7. **Tutor — chain reasoning.** Forcing chains / simple coloring / X-cycles / XY-chains. Architectural lift (graph-walking strong/weak links). Unlocks the genuinely hard puzzles where pattern matching bottoms out.
8. **Profile / Achievements / Calendar (one connected feature).** All of these read from the existing `scores` table:
   - **Calendar view** of past dailies; tap to play any missed day. Backend already serves arbitrary daily ids (`GET /v1/daily/:puzzle_id`) — mostly a client surface.
   - **Rolling consistency metric** (Derek's preferred competitive number — see below): `distinct dailies completed / N` over the trailing N days. Default N=28. 28/28 in last 28 days = 100% "perfect score". Surfaced as a ring/percentage on profile + next to player names on the group members view. Fairer than lifetime counters for new joiners.
   - **Trophies / milestones**: lifetime volume (50/100/365 dailies done), tier-specific (50 hards, 100 mediums…), accuracy (100 dailies with no mistakes), purist counts; AND rolling-window awards: Casual (50% consistency), Regular (75%), Perfect 28 (100%). Plus current streak + best streak ever. Plus a **"Polymath" / "All-Rounder"** badge for using a tutor hint at least once for each of the 21 techniques (encourages educational engagement; track via a new `user_techniques_used` table — `(user_id, technique, first_seen_at)`, INSERT OR IGNORE on each `applyTutorHint`).
   - **Friend visibility**: badges + consistency ring show next to a player's name on the leaderboard + group members view, so milestones become a flex. Need a backend endpoint that returns derived achievements per user (compute from scores rather than persist — keeps the source of truth simple).
   - **Design principle (Derek 2026-05-05)**: lifetime metrics anchor identity (long-time players have something to show on profile) but the *competitive* friend-visible number is the rolling consistency window — gives everyone the same target regardless of when they joined.
   - **Open product questions**: do late-completed dailies count toward the consistency window (probably yes — that's the catch-up loop) but NOT for the per-day leaderboard rank? Streak rule when you miss a day — snap to 0, grace day, or "best 28-of-30" forgiveness window? Short design pass before code.
9. **Polish bucket.** Per-group timezone, solution vs rule mistake toggle, cross-session Undo, per-tier dailies.

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
- **D1 database**: name `sudoku`. Schema in `Backend/migrations/0001_init.sql` (7 tables: `users`, `auth_codes`, `auth_tokens`, `daily_puzzles`, `groups`, `group_members`, `scores`).
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
