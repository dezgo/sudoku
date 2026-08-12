# MEMORY.md — where this project's memory lives

Mirrors the layout used in `bot-team`. Three stores, each with a different job:

- **Canonical memory (atomic per-fact notes):**
  `C:\Users\Derek\.claude\projects\C--Users-Derek-Documents-Coding-Python-Scripts-sudoku\memory\`
  Claude Code's native memory — auto-surfaced at session start. One fact per file, indexed by
  `MEMORY.md` **inside that folder**. Durable preferences, decisions and constraints go here,
  not in this file.

- **Session logs (here, Git-synced):** [`docs/logs/YYYY-MM-DD.md`](docs/logs/)
  What happened in a given session — changes, testing, decisions, discoveries. Written at
  wrap-up.

- **Outstanding work (here, Git-synced):** [`docs/TODO.md`](docs/TODO.md)
  Deferred tasks and recurring maintenance. The single place to look for "what's next".

Project state and architecture live in [`STATUS.md`](STATUS.md) and [`SPEC.md`](SPEC.md) —
`SPEC.md` is the canonical behaviour contract.

## Note

Unlike `bot-team`, this project's memory folder is **not currently junctioned to Google Drive**,
so it is local to this machine and not browsable in Obsidian. Set up the junction if you want
cross-machine parity — bot-team's store lives at
`G:\My Drive\claude\memory\C--Users-Derek-Documents-Coding-Python-Scripts-bot-team\`.

The memory folder was found **empty** on 2026-08-12 despite `STATUS.md` referencing two notes by
name, meaning those standing rules had stopped reaching Claude entirely. Worth checking it's
populated if behaviour drifts from documented preferences.
