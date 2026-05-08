# Sudoku Crew — Multiplayer v3 Design

A turn-based async multiplayer mode. 2+ players share one board; each turn, the active player places exactly one number — wrong placements end their turn just like correct ones. Push notifications poke the next player. Like Words With Friends or chess.com, but for sudoku.

This doc is a blueprint, not an implementation plan. Read it, redirect anything that feels off, then we cut code.

---

## 1. Game model

Three new D1 tables. Naming follows existing conventions (`group_members`, `auth_tokens` etc.).

### `multiplayer_games`

```
id                     TEXT PRIMARY KEY    -- UUID-shaped
puzzle_id              INTEGER NOT NULL    -- references daily_puzzles OR generated; can be the daily for that date
puzzle_givens          TEXT    NOT NULL    -- JSON int[9][9]; cached so we don't depend on a daily_puzzles row
puzzle_solution        TEXT    NOT NULL    -- JSON int[9][9]
created_by             TEXT    NOT NULL REFERENCES users(id)
created_at             INTEGER NOT NULL    -- unix-millis
status                 TEXT    NOT NULL    -- 'pending' | 'active' | 'completed' | 'abandoned'
active_player_id       TEXT             REFERENCES users(id)   -- NULL while pending
turn_deadline          INTEGER          -- unix-millis when active player's turn forfeits; NULL while pending
turn_duration_seconds  INTEGER NOT NULL    -- 3600 | 21600 | 86400 | 0 (0 = unlimited)
invite_code            TEXT    NOT NULL UNIQUE    -- 6-char base32, mirrors group invite codes
winner_id              TEXT             REFERENCES users(id)   -- NULL until completed
completed_at           INTEGER
```

### `multiplayer_players`

```
game_id     TEXT NOT NULL REFERENCES multiplayer_games(id)
user_id     TEXT NOT NULL REFERENCES users(id)
join_order  INTEGER NOT NULL    -- 0..N-1, dictates rotation
status      TEXT    NOT NULL    -- 'invited' | 'joined' | 'declined' | 'left'
joined_at   INTEGER             -- unix-millis when status became 'joined'
PRIMARY KEY (game_id, user_id)
```

Index on `user_id` for the "list my games" query.

### `multiplayer_moves`

```
id          INTEGER PRIMARY KEY AUTOINCREMENT
game_id     TEXT    NOT NULL REFERENCES multiplayer_games(id)
move_index  INTEGER NOT NULL    -- 0, 1, 2, ... within the game
player_id   TEXT    NOT NULL REFERENCES users(id)
row         INTEGER NOT NULL    -- 0-8
col         INTEGER NOT NULL    -- 0-8
value       INTEGER NOT NULL    -- 1-9; we never log "no placement"
was_correct INTEGER NOT NULL    -- 0/1 against puzzle_solution
placed_at   INTEGER NOT NULL
```

Index on `(game_id, move_index)` for chronological replay. Server reconstructs the live board state from `puzzle_givens` + correct moves.

### `push_tokens` (also serves leaderboard notifications, see §5)

```
user_id     TEXT NOT NULL REFERENCES users(id)
platform    TEXT NOT NULL    -- 'ios' | 'android'
token       TEXT NOT NULL UNIQUE
updated_at  INTEGER NOT NULL
PRIMARY KEY (user_id, token)
```

A user can have multiple tokens (iPhone + iPad + Android). Tokens are device-scoped, not user-scoped.

---

## 2. API endpoints

All under `/v1/multiplayer/...`. Bearer auth. Conventions match existing endpoints (snake_case wire format, `error` field on non-2xx).

| Method | Path                                  | Body                                                          | Response |
|--------|---------------------------------------|---------------------------------------------------------------|----------|
| POST   | `/multiplayer/games`                  | `{ difficulty, turn_duration_seconds, invited_user_ids?, group_id? }` | `{ game, invite_code }` |
| GET    | `/multiplayer/games/:id`              | —                                                             | `{ game, players, moves, board }` (board is the current cells) |
| POST   | `/multiplayer/games/:id/join`         | `{ invite_code? }` (omit if user is in `invited_user_ids`)    | `{ game }` |
| POST   | `/multiplayer/games/:id/decline`      | —                                                             | `204` |
| POST   | `/multiplayer/games/:id/leave`        | —                                                             | `204` (counts as forfeit if game is active) |
| POST   | `/multiplayer/games/:id/start`        | —                                                             | `{ game }` (only host; only when ≥2 players joined) |
| POST   | `/multiplayer/games/:id/moves`        | `{ row, col, value, idempotency_key }`                        | `{ move, game, board }` |
| GET    | `/me/multiplayer/games`               | —                                                             | `{ in_progress: [], completed: [] }` |
| POST   | `/me/push_token`                      | `{ platform, token }`                                         | `204` |
| DELETE | `/me/push_token`                      | `{ token }`                                                   | `204` (sign-out, device removal) |

`POST /moves`'s `idempotency_key` (UUID generated client-side) is required — guarantees a flaky network retry doesn't double-place.

`game` payload shape:

```
{
  id, puzzle_id, status, active_player_id, turn_deadline,
  turn_duration_seconds, created_by, created_at, completed_at,
  winner_id, invite_code,
  // derived fields:
  is_my_turn: bool, time_remaining_seconds: int,
}
```

---

## 3. Turn rules

**Active player rotation**: `join_order` defines the cycle. After a move, set `active_player_id = next player whose status='joined' in cyclic order`. Skip 'left' players entirely.

**Move validation**:
1. Caller is the active player.
2. Game status is `'active'`.
3. (row, col) is currently empty on the reconstructed board (no prior correct move there; ignores wrong-attempt moves which didn't fill the cell).
4. Value is 1-9.

**Wrong placements stay empty**. The crucial design call: when a player places a wrong value, the cell does NOT get filled with the wrong digit (that'd make the puzzle unsolvable). Instead:
- The attempt is logged in `multiplayer_moves` with `was_correct = 0`.
- The cell stays empty.
- A "mistake" is visible to all players in the move history.
- Turn ends, rotates.

This means players can't sabotage the board, but they can waste their turn — that's the strategic cost of a guess.

**Turn deadline**: when active_player's `turn_deadline` passes, a forfeit fires (see Cron in §5). Forfeit logs an empty "skip" entry in moves (or skip moves entirely; skip count tracked on player) and rotates.

**Game ends** when:
- The board is fully solved (all 81 cells correct). `winner_id` set per §4.
- Only one player remains 'joined' (others all left/declined). Status → 'abandoned'.
- 3 consecutive full-rotation forfeit cycles (no one's playing). Status → 'abandoned'.

---

## 4. Win condition

**Recommend "weighted score" with badges, not a single ranking.** Here's why: a single-winner rule produces gaming behavior (people stop playing safe placements to deny others). Multi-stat reward makes everyone feel they got something.

End-of-game show:

| Stat              | Computed from           |
|-------------------|-------------------------|
| Correct placements | `count(was_correct=1)` per player |
| Mistakes          | `count(was_correct=0)`  |
| Forfeits          | timeout count           |
| Solver            | who placed the final correct digit |

Highlight the player with the most correct placements as **"Most Productive"**, fewest mistakes as **"Most Accurate"**, fastest avg turn time as **"Quickest"**, and the player who placed the final digit as **"Solver"**. One-of-each = everyone wins something.

If you want a single winner anyway: **combined score = correct - 2 × mistakes**, tie-break by Solver. Configurable via game settings ("competitive mode" toggle).

---

## 5. Push notifications

**Events**:

| Event                       | When                                                | To           |
|-----------------------------|-----------------------------------------------------|--------------|
| `your_turn`                 | After another player makes a move                   | Next player  |
| `turn_running_low`          | 25% of turn_duration remains                        | Active player|
| `turn_forfeited`            | Active player timed out                             | Forfeit-er + new active player |
| `game_completed`            | Board solved                                        | All players  |
| `game_abandoned`            | Forfeit cycle or last player                        | All players  |
| `friend_joined_leaderboard` | (existing v2 idea, build now while infra is here)   | Group members|

**Infrastructure**:
- **iOS**: APNs HTTP/2 with auth-key JWT (no cert renewal hassle). Cloudflare Workers can call APNs via `fetch` to `https://api.push.apple.com/3/device/<token>` with a JWT bearer signed by Apple's `.p8` key. Need to store `.p8` content + key ID + team ID as Worker secrets.
- **Android**: FCM HTTP v1 API. Sign a JWT with the Firebase service-account private key, swap for an OAuth token, send via `https://fcm.googleapis.com/v1/projects/<project-id>/messages:send`. Service account JSON stored as Worker secret.
- **Token lifecycle**: client registers via `POST /me/push_token` after sign-in. On `401 BadDeviceToken` from APNs (or `UNREGISTERED` from FCM), Worker prunes the token row.

**Forfeit cron**: a scheduled Worker (cron `* * * * *` — every minute) scans `multiplayer_games WHERE status='active' AND turn_deadline < now()` and processes each.

**Open question**: do we use a third-party (OneSignal, Pusher Beams) or roll our own JWT-based push? Vendor saves ~3 days of plumbing but adds a recurring cost + lock-in. For friends-and-family scope, vendor is faster to ship; for control, native is better. Default: native via JWT.

---

## 6. Client UX

### Lobby screen (new tab on home, or a "Multiplayer" button)

- Top section: **Your turn now** (badge count) — list of games where it's your turn. Tap → game.
- Middle: **In progress** — games waiting on someone else, sorted by recency.
- Bottom: **Completed** — recent finished games with stats summary.
- Floating button: **+ New game**.

### New game flow

1. Difficulty (Easy/Medium/Hard) — uses the local generator with calibration.
2. Turn duration (1h / 6h / 24h / Unlimited).
3. Invite — pick a group OR add specific users OR generate a share-code link. (Hybrid: pre-invite known users + share a code for anyone else.)
4. Confirm. Game enters `pending`. Other players get push: "X invited you to a sudoku game".

### In-game view

- **Header**: "Game with X, Y, Z" + whose turn + countdown.
- **Board**: same renderer as solo mode. Read-only when it's not your turn (taps don't select). When it IS your turn, normal selection works but only `enter` (placement) is available — no pencil mode, no auto-pencil, no tutor.
- **Pad**: number row 1-9. Tapping a digit confirms placement (with an "Are you sure?" sheet for the first move per game, since wrong placements end your turn).
- **Move history strip**: bottom 80px. Avatar + "Y placed 7 at C5 ✓" / "Z tried 3 at A1 ✗". Last 5-10 moves visible.
- **Players list** (top-right or sidebar): avatars with their correct/mistake counts so far. Active player highlighted.
- **Forfeit banner**: when 25% of turn time remains and it's your turn — "5 minutes left, place something!"

### No assists allowed

Hints, auto-pencil, mistake-highlighting are all hidden in multiplayer. The strategy IS the assist. Adding assists makes the game less interesting. Mistakes still count toward stats — but they're surfaced only at game end (not real-time).

### Edge cases

- **Player declines invite**: removed from players list; game can still start with remaining ≥2 joined.
- **Host doesn't start game**: game auto-cancels after 7 days in `pending`.
- **Mid-game leave**: status='left'; their turn is permanently skipped. Game continues with remaining.
- **All forfeit in a row** (one full rotation with no moves): warn all players via push; if 3 cycles pass, game → `abandoned`.
- **Connectivity issue placing a move**: client retries POST with the same `idempotency_key`; server is idempotent on (game_id, idempotency_key).

---

## 7. Cheating / fairness

- Solution lookup is server-side only; client never sees `puzzle_solution` until game is `completed`.
- A player could try to brute-force by placing every digit 1-9 at every cell — but each wrong placement ends their turn, so brute-forcing takes 81 turns minimum and tells everyone what's wrong. Self-defeating.
- Don't expose `was_correct` in the move response until the move is committed and broadcast — prevents the "place, see if correct, undo if wrong" exploit. Once the move lands, the result is everyone's to see.

---

## 8. Engineering scope

| Area                          | Hours | Notes |
|-------------------------------|-------|-------|
| Backend schema + migration    | 3-4   | Three tables + `push_tokens` |
| Game CRUD endpoints           | 12-16 | Create, join, leave, start, get |
| Move endpoint + rotation      | 6-8   | Validation, state reconstruction, broadcast |
| Forfeit cron                  | 3-4   | Minute-granularity scan |
| APNs + FCM JWT push           | 16-20 | The biggest unknown — native push from Workers is non-trivial |
| Push token registration API   | 2-3   | |
| iOS: lobby + in-game UI       | 16-20 | Reuses BoardView, new lobby + play views |
| iOS: push token registration  | 4-6   | APNs entitlement, device token capture |
| iOS: state sync               | 8-10  | Poll vs WebSocket; recommend poll for v3 simplicity |
| Android: lobby + in-game UI   | 16-20 | Same as iOS |
| Android: FCM token            | 4-6   | Firebase setup + plumbing |
| Android: state sync           | 8-10  | Same as iOS |
| End-of-game stats sheet       | 4-6   | Both platforms |
| Polish, bug bash, edge cases  | 16-24 | Always more than expected |
| **Total**                     | **120-160 hrs** | **3-4 weeks of focused work** |

For comparison, the entire Coach Mode (4 scenarios, framework, both platforms, persistence, tests) was about ~6 hours. Multiplayer v3 is ~25× the work.

**Compression options**:
- Use OneSignal/Pusher Beams instead of native push: saves ~15h, costs ~$10-30/mo and adds vendor.
- Skip Android v1 — ship iOS-only first: saves ~30h but breaks the "friends play across both platforms" vision.
- WebSocket vs poll: poll is simpler (4-6h saved), feels less responsive but "your turn" pushes solve the responsiveness problem.

---

## 9. Product decisions (locked 2026-05-04)

These are settled. Building from these defaults:

1. **Win condition**: stats salad — "Most Productive / Most Accurate / Quickest / Solver" badges. Per-game `competitive_mode` toggle adds a single-winner ranking on top (correct − 2×mistakes, tie-break by Solver).
2. **Wrong placements**: cell stays empty. Attempt is logged with `was_correct=0` in `multiplayer_moves`, surfaced in the move-history strip but not in the board.
3. **Default turn duration**: 24h. Configurable per-game from `[3600, 21600, 86400, 0]` (1h / 6h / 24h / unlimited).
4. **Concurrent games**: allowed, capped at 10 active per user. New-game endpoint returns 409 if the cap is hit.
5. **Puzzle source**: host picks difficulty (Easy/Medium/Hard); server generates a fresh puzzle for that game using the same calibrated generator as solo/daily. Independent of any specific daily.
6. **Hints / auto-pencil / tutor**: all disabled in multiplayer. The pad shows only digits 1-9 + erase. The strategy IS the assist. (As Derek noted: "surely someone will work out a cell" — which is the point.)
7. **Push provider**: native APNs + FCM via JWT from Workers. Service-account JSON + APNs `.p8` stored as Worker secrets.
8. **Rematch**: completed game's results sheet offers "Rematch" button → creates a new game with the same players + same difficulty + same turn duration. Players each accept individually.
9. **Public-link invites**: supported. `POST /multiplayer/games` returns an `invite_code`; `play.appfoundry.cc/m/<code>` deep-links into the app's join flow. Coexists with direct user invites.
10. **Game-end push**: when status flips to `completed` or `abandoned`, push fires to every joined player with the result summary.

---

## 10. Suggested phasing

If you want to land this incrementally rather than 3-4 weeks straight:

**Phase A (1 week)**: Backend foundations — schema, push token API, push infrastructure (APNs+FCM JWT). No game logic yet. Validate push works end-to-end with a test endpoint that sends "hello" notifications.

**Phase B (1 week)**: Game CRUD + move endpoint + forfeit cron. Backend-only. Test via curl and a minimal "make-a-move" CLI.

**Phase C (1 week)**: iOS lobby + in-game UI. Manually trigger pushes from backend during dev.

**Phase D (1 week)**: Android mirror + end-of-game stats + polish + bug bash + ship.

Each phase is shippable on its own (Phase A: nothing user-visible; B: backend done; C: iOS-only multiplayer; D: cross-platform). Phase C could go to friends-and-family for early-feedback signal.

---

## 11. Things explicitly out of scope for v3

- **Real-time spectator mode** — watching a game without playing. Add later if requested.
- **Persistent game-room chat** — text messages between players in-game. Adds moderation surface, big scope.
- **Tournament brackets / leagues** — multi-game competitive structures.
- **Ranked / unranked split** — ELO-style ranking. Cool but speculative until usage exists.
- **Bot opponents** — AI player. Defeats the social purpose.
- **Cooperative variant** — same board, work *together* (like the multi-player puzzle but no turns). Worth doing as a separate v4; different mechanics.
