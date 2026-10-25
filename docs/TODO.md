# Deferred Tasks

## How to Work Through TODOs

Work autonomously, make sensible assumptions, save questions for the end, and report back with what was completed and what questions came up.

**Rules that always apply** (see `STATUS.md` "Working with this project"):
- **The web app is production.** Sudoku Crew is now the PWA in `Web/`, live at `sudokucrew.com/play` (Oct 2026). New behaviour goes into `Web/` and `SPEC.md` together. The iOS/Android apps are being retired: keep them working, but don't add features to them.
- **`main` = what's deployed.** Deploy with `npm run deploy` in `Backend/` (builds `Web/` first); keep GitHub `main` in step with the live site.
- **Personal email default.** Never put the work email into test commands, config, or DNS.

## Pending Tasks

### Blocking / infrastructure

- **✅ Done: npm repaired** (Node 24 LTS / npm 11). `wrangler deploy` and `wrangler tail` both work; used heavily on 2026-10-25.

- **✅ Done: contact-address change deployed.** The live pages show `hello@sudokucrew.com`.

- **✅ Done 2026-08-12: `sudokucrew.com` bound as a Worker Custom Domain** and serving the landing page (200). The `[[routes]]` entry in `Backend/wrangler.toml` is committed so config matches reality. Optional extras still open: `www.sudokucrew.com` as a second Custom Domain, and a host check in `route()` if the API should *not* answer on `sudokucrew.com` (currently it will; harmless — same Worker, same auth).

- **✅ Done 2026-08-12: edge rate limiting on `/v1/auth/start`.** Cloudflare rate-limiting rules named `auth-start-rate-limit` deployed in **both** zones — `appfoundry.cc` and `sudokucrew.com` — because the Worker serves every route on both hostnames and rate limiting is zone-scoped, so one rule alone would leave the other door open. Config (Free plan caps the options): expression `http.request.uri.path eq "/v1/auth/start"`, **5 requests / 10 seconds** counted by **IP**, action **Block**, duration **10 seconds**, Active. Verified by firing 8 rapid requests at each hostname — 5×400 then 3×429 on both — and confirmed the block is path-scoped (`/health`, `/v1/version`, `/v1/daily/today` all stayed 200 while limited).

  Deliberately **not** tighter than 5: the count is per IP, so a group of friends signing up on one home or school WiFi shares an address, and 2/10s would have blocked the third kid — the exact failure this whole exercise exists to prevent. Note the Free plan locks the period and duration to 10 seconds; 1-minute and longer windows are paid-only.

- **⚠️ Rate limiting is only a partial fix — the quota is still exposed.** 5 per 10s still permits 1,800/hour from a single IP, and Resend free is **100 emails/day**, so a determined attacker (or one rotating IPs) can still lock out every real signup for a day. The endpoint remains public, unauthenticated, and sends an email on every non-blocked call.

  **Client side done in the web app (2026-10-25):** a Resend-code button with a 30s cooldown, a lock so a double-tap can't send twice (a double send replaces the first code and makes it fail), and distinct copy for 429 and for "can't reach the server". **Still needed, in the Worker:** a per-email cooldown — the `auth_codes` row already carries `expires_at`, so refuse a re-send if one was issued in the last ~60s and return a distinct error the client can show. Pairs naturally with the "Resend code" button below, which needs a cooldown regardless. **Also:** a Resend bounce webhook to stop repeat sends to addresses already known bad, so one typo can't compound into reputation damage. **And:** a 429 currently surfaces as the generic "Something went wrong" (`AuthStore` only special-cases 400), so a rate-limited user gets no useful message — fold into the error-mapping work below.

- **Add uptime monitoring on `sudoku.appfoundry.cc/health`.** On 2026-08-12 a dashboard edit deleted the host's DNS record and took the entire backend offline for every installed app; it was noticed only because someone happened to try signing up. The `/health` endpoint exists for exactly this and nothing polls it. Any free checker (UptimeRobot, Cloudflare Health Checks) with alerts to `hello@sudokucrew.com` would have caught it in a minute.

- **⚠️ Never remove `sudoku.appfoundry.cc` as a Custom Domain.** Four bindings are compiled into shipped app binaries — `APIClient.swift:295`, `ApiClient.kt:24`, `Sudoku.entitlements` (`applinks:`), `AndroidManifest.xml:37` (`android:host`) — plus the store-listing privacy URL and every invite link already shared. It is the live host; `sudokucrew.com` is the spare. When adding Custom Domains, **add alongside, never replace** — Cloudflare deletes the DNS record of one you remove. Switching the clients to `sudokucrew.com` in a future release is fine, but the old host stays bound indefinitely for devices that never update.

### Email / deliverability follow-up

- **Register `sudokucrew.com` in Google Postmaster Tools.** The only way to actually watch the new domain's reputation build rather than guessing. Requires the DMARC record (already added).
- **Tighten DMARC from `p=none` to `p=quarantine`** once aggregate reports confirm alignment is clean. No delivery impact either way; `p=none` was chosen as the safe starting policy.
- **Move Markd to its own sending domain.** It is still sending public-signup verification mail from `appfoundry.cc` on the old Resend account. Not urgent for Sudoku now that the domains are separate, but Markd's own signups are presumably suffering the same Gmail block — and the shared-domain pattern is what caused this.
- **Do not send Sudoku mail from `appfoundry.cc` again.** Reputation recovers over weeks of clean sending, if at all. Recorded in `Backend/README.md` → "Sending domain".

### Speed mode — ✅ rebuilt in the web app (2026-10-25)

Done in `Web/` as planned: real `activeNumber` state, the pad only arms, only board taps place, speed + pencil does rapid notes, the digit disarms when complete, and arrow keys never place. Two lessons from testing on Derek's phone, now in `SPEC.md` §9: while a digit is armed the board shading must mean **only** "can't go here" (the selection's row/col/box tint looked identical and hid a legal square), and the selection is drawn as a faint outline rather than the yellow fill.

The app-era speed-mode bugs (arrow keys spraying digits, stray notes, the tenth-copy bypass, the pad layout) are **not being fixed in the store apps**, which are being retired.

### Sign-in flow hardening

Created by the 2026-08-12 outage — none of these caused it, but each one made it harder to notice or recover from.

- **✅ Web app: "Resend code" button with a 30s cooldown.** (Apps: not being fixed.) Original note: add a "Resend code" button on the code step, with a cooldown. Today `SignInView.swift:126` offers only "Use a different email", so a user who never receives a code has no recovery path at all — they just sit on the code screen. Matters more than usual while the new domain warms up and a code may land in spam.
- **`authStart` writes the `auth_codes` row before sending** (`Backend/src/auth.ts:33-40`), so a failed send leaves a code the user can never receive. Send first, or roll the row back on failure.
- **✅ Web app shows "Couldn't send the code" for a failed send.** Original note: surface a distinct message when the send itself fails. Everything currently collapses into "Something went wrong. Try again." (`SignInView.swift:192`), which tells a blocked user nothing and gave us no signal from the field.
- **✅ Web app: an unreachable server gets its own message** ("Can't reach the server. Check your connection or try again shortly."). Original note: a server that can't be reached reports "Something went wrong. Try again." `APIError.offline` covers only `.notConnectedToInternet`, `.networkConnectionLost` and `.timedOut` (`APIClient.swift:580-582`), so a DNS failure (`.cannotFindHost`, `.dnsLookupFailed`) or a refused connection (`.cannotConnectToHost`) falls through to `APIError.unknown` → `SignInError.server` → the generic red message. During the 2026-08-12 outage this made a total backend outage indistinguishable from a server bug, on both the user's side and ours. Add the reachability codes and give them their own copy — something like "Can't reach the server. Check your connection or try again shortly." Mirror on Android.

- **Consider a delivery-failure signal.** A Resend webhook into the Worker would let the backend know a code bounced, so the app could say "we couldn't deliver to that address" instead of showing a code screen for a mail that will never arrive.

### Web app — Derek's idea queue

- **✅ Done 2026-10-25: daily history calendar.** Every daily since launch (29 Apr 2026), catch-up play, streaks that a catch-up repairs, perfect-month trophies, 7/30/100/365-day milestones, and "caught up" tags on late leaderboard entries.
- **Next: your setup follows you between devices.** In-progress games, settings, Coach trophies and random-puzzle history live only in the browser today (and an iPhone home-screen app has storage separate from Safari). Needs backend tables + endpoints, e.g. `daily_saves` / `user_prefs`, as sketched under "Cross-device sync — Phase 2" in `STATUS.md`.
- **Then: shareable games and challenges.** Random games exist only on the device that made them. Store them server-side under a memorable three-word name (what3words-style, e.g. `eagle-blackbird-house`), with a link like `sudokucrew.com/p/eagle-blackbird-house` that opens the exact puzzle, plus "beat my time" challenges.
- **Decide: should the server's daily get proper difficulty grading?** `Backend/src/generator.ts` picks the daily by clue count only (32), so it's almost always solvable with singles. The web app's generator grades by technique (see `SPEC.md` §6). Changing the daily changes how hard everyone's puzzle feels, so it's Derek's call.
- **Web push for multiplayer turns.** The web app polls while a game is open; nothing tells you it's your turn when the app is closed. Needs VAPID keys + Web Push encryption in the Worker. iPhone only delivers web push to home-screen apps.
- **Coach: the remaining 7 technique scenarios** (carried over from the apps).

### Retiring the store apps

- **Tell existing app users they've moved.** The apps check `/v1/version` on launch and show an "update available" banner that opens the store. Cleanest path: one last app release whose banner says "Sudoku Crew has moved to sudokucrew.com/play", then bump `*_CURRENT_VERSION` once it's live. **Never** raise `*_MIN_REQUIRED_VERSION` to force it — that locks people out.
- **Then remove the store listings.** `/privacy` covers both the web app and the apps, so the listing's privacy URL stays valid until then.
- **Keep `sudoku.appfoundry.cc` bound indefinitely** (see the warning above): installed apps keep calling it.
- **App-only bugs left unfixed on purpose:** the apps' difficulty grader can't produce real Medium/Hard puzzles (fixed in the web app); `iOS/SudokuTests/TutorTests.swift` `swordfish_onRows` can never pass (its board leaves nothing to eliminate; the web port keeps it as `it.fails` plus a corrected board).

### Larger, unstarted

- **Full-codebase review.** The review run on 2026-08-12 covered only `git diff HEAD~3` (pad highlight, speed mode, the backend `waitUntil` change), not the whole-codebase sweep that was asked for. Backend came back clean; all findings were iOS.
- **Reconsider the auth model.** Email OTP is the *only* thing email is used for in this backend — one call site (`auth.ts:40`). Options discussed: **Sign in with Apple** (near-ideal for an all-iPhone friend group; Android needs Google Sign-In alongside it), or **anonymous-first accounts** (first launch creates a device-bound account, display name, join via invite code — every piece already exists: `generateUserId()`, Keychain tokens, group invite codes, `/m/<code>` deep links). Anonymous-first removes the signup wall entirely and deletes this whole class of problem; the tradeoff is no cross-device recovery without an added method. Both need App Store + Play Store releases, unlike the domain fix.

## Recurring Maintenance

- **Doc accuracy.** `STATUS.md` carried a false DMARC claim that actively misled a diagnosis, plus a stale memory path and two memory filenames that no longer existed. When a doc asserts infrastructure state, verify it rather than trusting it.
- **Memory store health.** The auto-memory directory was found **empty** on 2026-08-12 while `STATUS.md` referenced two notes by name — so those standing rules weren't reaching Claude at all. Worth a periodic check that `MEMORY.md` and the notes it indexes both exist.
- **Spec drift.** `SPEC.md` describes the web app; update it in the same change as `Web/`. (The old iOS/Android mirroring rule no longer applies now the apps are being retired.)
- **Backend typecheck.** `npx tsc --noEmit` in `Backend/` reports one existing error at `src/generator.ts:146` (`number | undefined`). It doesn't block deploys (wrangler bundles without type-checking), but fix it before relying on the typecheck.
- **Version pins.** Only bump `*_CURRENT_VERSION` in `wrangler.toml` *after* confirming the release is live in the store, never at upload — otherwise the in-app banner offers an update the store doesn't have yet.
