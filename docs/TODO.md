# Deferred Tasks

## How to Work Through TODOs

Work autonomously, make sensible assumptions, save questions for the end, and report back with what was completed and what questions came up.

**Two rules that always apply** (see `STATUS.md` "Working with this project"):
- **Dual-platform mirror.** Any behavioural change to one app must land in the other *and* in `SPEC.md`, in the same response.
- **Personal email default.** Never put the work email into test commands, config, or DNS.

## Pending Tasks

### Blocking / infrastructure

- **⚠️ Repair npm — there is no working deploy path, and changes are now queued behind it.** `npm` and `npx` both fail machine-wide. Diagnosed 2026-08-12: npm's bundled `socks-proxy-agent` requires `agent-base/index.js`, but the installed `agent-base` at `C:\Program Files\nodejs\node_modules\npm\node_modules\agent-base` ships only `dist/` — a global install has clobbered npm's own dependency tree with an incompatible version. So `wrangler deploy`, `wrangler tail` and `wrangler secret put` are all unavailable, and there is **no Worker log access** (which cost real diagnostic time during the outage).

  **Recommended fix: reinstall Node LTS.** Node 18.17.1 is well past end-of-life, and a current installer replaces the broken npm cleanly. Repairing `agent-base` in place would also work but needs admin rights on `Program Files` and leaves an EOL runtime. `corepack` 0.18.0 *is* functional if a faster workaround is wanted (activate pnpm, install wrangler with it).

  **Blocked on this:** the contact-address change below, and any future backend deploy.

- **Deploy the contact-address change.** `sudoku@appfoundry.cc` → `hello@sudokucrew.com` across `landing.ts`, `privacy.ts` and `delete-account.ts` is committed but **not live** — the pages are Worker-rendered, so unlike `EMAIL_FROM` this cannot be done from the dashboard. The live footer still shows the old address until the Worker is redeployed.

- **✅ Done 2026-08-12: `sudokucrew.com` bound as a Worker Custom Domain** and serving the landing page (200). The `[[routes]]` entry in `Backend/wrangler.toml` is committed so config matches reality. Optional extras still open: `www.sudokucrew.com` as a second Custom Domain, and a host check in `route()` if the API should *not* answer on `sudokucrew.com` (currently it will; harmless — same Worker, same auth).

- **Add uptime monitoring on `sudoku.appfoundry.cc/health`.** On 2026-08-12 a dashboard edit deleted the host's DNS record and took the entire backend offline for every installed app; it was noticed only because someone happened to try signing up. The `/health` endpoint exists for exactly this and nothing polls it. Any free checker (UptimeRobot, Cloudflare Health Checks) with alerts to `hello@sudokucrew.com` would have caught it in a minute.

- **⚠️ Never remove `sudoku.appfoundry.cc` as a Custom Domain.** Four bindings are compiled into shipped app binaries — `APIClient.swift:295`, `ApiClient.kt:24`, `Sudoku.entitlements` (`applinks:`), `AndroidManifest.xml:37` (`android:host`) — plus the store-listing privacy URL and every invite link already shared. It is the live host; `sudokucrew.com` is the spare. When adding Custom Domains, **add alongside, never replace** — Cloudflare deletes the DNS record of one you remove. Switching the clients to `sudokucrew.com` in a future release is fine, but the old host stays bound indefinitely for devices that never update.

### Email / deliverability follow-up

- **Register `sudokucrew.com` in Google Postmaster Tools.** The only way to actually watch the new domain's reputation build rather than guessing. Requires the DMARC record (already added).
- **Tighten DMARC from `p=none` to `p=quarantine`** once aggregate reports confirm alignment is clean. No delivery impact either way; `p=none` was chosen as the safe starting policy.
- **Move Markd to its own sending domain.** It is still sending public-signup verification mail from `appfoundry.cc` on the old Resend account. Not urgent for Sudoku now that the domains are separate, but Markd's own signups are presumably suffering the same Gmail block — and the shared-domain pattern is what caused this.
- **Do not send Sudoku mail from `appfoundry.cc` again.** Reputation recovers over weeks of clean sending, if at all. Recorded in `Backend/README.md` → "Sending domain".

### Speed mode — rebuild around real state

Derek's original intent: *"you have a number selected, then any blank cell you click gets that number."* The current implementation can't express that, because there is no "selected number" in the model — it's inferred from the value of the currently selected cell.

- **Add `activeNumber: Int?` as real state** on `SudokuGame` / `GameState`, and drive speed mode from it:
  - Pad tap in speed mode **arms** the digit (`activeNumber = (activeNumber == n) ? nil : n`) instead of placing or navigating.
  - Board tap on an empty, unlocked cell with a digit armed places it; everything else is ordinary selection.
  - Move placement **out of `select()`** and into the board's tap handler (`BoardView.swift:79-80`) — the only call site that actually means "the user tapped a cell".
  - Respect `mode`: speed + pencil becomes rapid note-filling (currently it writes stray notes by accident).
  - Clear `activeNumber` when `isComplete(n)` goes true.
  - Speed off → `activeNumber` stays nil and all existing behaviour is unchanged.
- **This is a three-way change**: `iOS/Sudoku/SudokuGame.swift` + `BoardView.swift` + `NumberPadView.swift`, the Android mirror (`state/GameState.kt`, `state/SudokuGameViewModel.kt`, `ui/NumberPadView.kt`), **and** `SPEC.md:190-194` — which currently documents the workaround ("the user falls back to the standard flow…") as though it were the design.
- **Deliberate consequence to confirm with Derek:** in speed mode a pad tap would stop doing tap-to-highlight navigation, since it now means "arm". Outside speed mode, navigation is unchanged.

### Speed-mode bugs (from the 2026-08-12 review, iOS verified)

All three are downstream of the shortcut living in `select()`; the rebuild above fixes them structurally. If the rebuild is deferred, they still need patching.

- **Arrow keys spray digits across the board.** `ContentView.moveSelection` (`ContentView.swift:601-605`, wired via `.onKeyPress`) calls `game.select(row:col:)`, so with speed mode on and an iPad keyboard attached, pressing an arrow key *places* the armed digit instead of moving. Selection follows the placement, so holding a key fills a line and arrow navigation becomes impossible. Highest severity.
- **Speed + Pencil writes stray notes.** The shortcut calls `enterDirect` without checking `mode`; the `.pencil` branch (`SudokuGame.swift:384`) toggles a note rather than placing a value. Should require `mode == .normal` — or become the deliberate rapid-notes feature described above.
- **Bypasses the completed-digit guard.** `isComplete(n)` is enforced only in the pad UI (`NumberPadView.swift:35-36`); the shortcut reaches `enterDirect` directly, so a tenth 5 can be placed once all nine are down — always a mistake, exactly what the disabled pad key exists to prevent.
- **⚠️ Android was not reviewed.** Its implementation mirrors iOS (`SudokuGameViewModel.kt:209`), so it likely shares at least the pencil-mode and `isComplete` defects. The arrow-key bug may not apply without hardware keyboard navigation. **Verify rather than assume.**
- **Number pad layout.** Three fixed-height (40pt) `Label`s now share one `HStack` (`NumberPadView.swift:58`), so "Pencil Off" / "Speed Off" / "Erase" each get roughly a third of the width and truncate on 4.7" devices and at large Dynamic Type. Icon-only buttons, a two-row layout, or `minimumScaleFactor`.

### Sign-in flow hardening

Created by the 2026-08-12 outage — none of these caused it, but each one made it harder to notice or recover from.

- **Add a "Resend code" button** on the code step, with a cooldown. Today `SignInView.swift:126` offers only "Use a different email", so a user who never receives a code has no recovery path at all — they just sit on the code screen. Matters more than usual while the new domain warms up and a code may land in spam.
- **`authStart` writes the `auth_codes` row before sending** (`Backend/src/auth.ts:33-40`), so a failed send leaves a code the user can never receive. Send first, or roll the row back on failure.
- **Surface a distinct message when the send itself fails.** Everything currently collapses into "Something went wrong. Try again." (`SignInView.swift:192`), which tells a blocked user nothing and gave us no signal from the field.
- **A server that can't be reached reports "Something went wrong. Try again."** `APIError.offline` covers only `.notConnectedToInternet`, `.networkConnectionLost` and `.timedOut` (`APIClient.swift:580-582`), so a DNS failure (`.cannotFindHost`, `.dnsLookupFailed`) or a refused connection (`.cannotConnectToHost`) falls through to `APIError.unknown` → `SignInError.server` → the generic red message. During the 2026-08-12 outage this made a total backend outage indistinguishable from a server bug, on both the user's side and ours. Add the reachability codes and give them their own copy — something like "Can't reach the server. Check your connection or try again shortly." Mirror on Android.

- **Consider a delivery-failure signal.** A Resend webhook into the Worker would let the backend know a code bounced, so the app could say "we couldn't deliver to that address" instead of showing a code screen for a mail that will never arrive.

### Larger, unstarted

- **Full-codebase review.** The review run on 2026-08-12 covered only `git diff HEAD~3` (pad highlight, speed mode, the backend `waitUntil` change), not the whole-codebase sweep that was asked for. Backend came back clean; all findings were iOS.
- **Reconsider the auth model.** Email OTP is the *only* thing email is used for in this backend — one call site (`auth.ts:40`). Options discussed: **Sign in with Apple** (near-ideal for an all-iPhone friend group; Android needs Google Sign-In alongside it), or **anonymous-first accounts** (first launch creates a device-bound account, display name, join via invite code — every piece already exists: `generateUserId()`, Keychain tokens, group invite codes, `/m/<code>` deep links). Anonymous-first removes the signup wall entirely and deletes this whole class of problem; the tradeoff is no cross-device recovery without an added method. Both need App Store + Play Store releases, unlike the domain fix.

## Recurring Maintenance

- **Doc accuracy.** `STATUS.md` carried a false DMARC claim that actively misled a diagnosis, plus a stale memory path and two memory filenames that no longer existed. When a doc asserts infrastructure state, verify it rather than trusting it.
- **Memory store health.** The auto-memory directory was found **empty** on 2026-08-12 while `STATUS.md` referenced two notes by name — so those standing rules weren't reaching Claude at all. Worth a periodic check that `MEMORY.md` and the notes it indexes both exist.
- **Dual-platform drift.** Confirm any iOS change has an Android counterpart and a `SPEC.md` update. Speed mode is a live example of a feature that exists on both but is specified around a workaround.
- **Version pins.** Only bump `*_CURRENT_VERSION` in `wrangler.toml` *after* confirming the release is live in the store, never at upload — otherwise the in-app banner offers an update the store doesn't have yet.
