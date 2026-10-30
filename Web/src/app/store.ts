// App-wide state: the iOS ContentView + its stores (GameStore, PuzzleHistory,
// AuthStore, GroupsStore, DailyPuzzleStore, ScoresStore) folded into one
// observable object. Components call `useStore()` and re-render on any
// change — the state is small enough that finer-grained subscriptions would
// be complexity without a payoff.

import { useEffect, useReducer } from 'preact/hooks';
import { Game, type SoundCue } from '../engine/game';
import { difficultyLabel, isDaily, type Difficulty, type Puzzle } from '../engine/types';
import type { TutorHint } from '../engine/tutor';
import { findHint } from '../engine/tutor';
import {
  api,
  ApiError,
  toPuzzle,
  UNAUTHORIZED_EVENT,
  type ApiUser,
  type GroupListItem,
  type ScoreSubmission,
} from '../lib/api';
import { playSound } from '../lib/sound';
import { lifelinesUsed, type Lifeline } from '../lib/lifelines';
import {
  KEYS,
  loadHistory,
  loadPrefs,
  loadSaves,
  nextPuzzleId,
  persistHistory,
  persistSaves,
  readJSON,
  writeJSON,
  type GameSave,
  type Prefs,
  type PuzzleResult,
} from '../lib/storage';
import { requestPuzzle } from './puzzles';
import { formatTime, localDailyId } from '../lib/format';

export type Phase = 'home' | 'playing';

export type Sheet =
  | { kind: 'newGame' }
  | { kind: 'games' }
  | { kind: 'settings' }
  | { kind: 'signIn'; then?: () => void }
  | { kind: 'solved'; rank: number | null; wasRanked: boolean }
  | { kind: 'completed'; result: PuzzleResult; fanfare: boolean }
  | { kind: 'leaderboard'; puzzleId: number }
  | { kind: 'groupMembers'; group: GroupListItem }
  | { kind: 'groupOnboarding'; mode: 'choose' | 'create' | 'join' }
  | { kind: 'coach' }
  | { kind: 'history' }
  | { kind: 'multiplayer'; gameId?: string }
  | { kind: 'confirmReset' }
  | { kind: 'share'; puzzle: Puzzle; seconds?: number }
  | { kind: 'lifelines'; used: Lifeline[] };

interface Identity {
  user: ApiUser;
  token: string;
}

interface DailyCache {
  today: Puzzle;
  tomorrow: Puzzle;
  fetchedAt: number;
}

type Pending = ScoreSubmission & { completed_at: number };

/** Co-op (SPEC §18): the live game this phone is in. */
export interface CoopState {
  name: string;
  me: string;
  players: Record<string, string>; // user id → display name
  online: string[];
  sels: Record<string, number | null>; // where each player is looking (0–80)
  by: (string | null)[]; // who placed each number
  started: boolean;
  connected: boolean;
  /** Lifelines anyone in the game has used — shared, like the board. */
  used: Lifeline[];
}

type CoopMsg =
  | { t: 'state'; values: number[]; by: (string | null)[]; mistakes: number; completed: boolean; used: Lifeline[] }
  | { t: 'used'; used: Lifeline[] }
  | { t: 'cell'; i: number; v: number; by: string | null; mistakes: number }
  | { t: 'presence'; players: Record<string, string>; online: string[]; sels: Record<string, number | null>; started: boolean; elapsed: number }
  | { t: 'sel'; id: string; i: number | null }
  | { t: 'done'; elapsed: number; mistakes: number };

/** Kept on this phone per co-op game: a stable local puzzle id and the player's private notes. */
type CoopLocal = Record<string, { id: number; notes?: number[][]; at: number }>;

type Listener = () => void;

class Store {
  prefs: Prefs = loadPrefs();
  saves: Record<number, GameSave> = loadSaves();
  history: PuzzleResult[] = loadHistory();
  identity: Identity | null = readJSON<Identity | null>(KEYS.identity, null);
  groups: GroupListItem[] = readJSON<GroupListItem[]>(KEYS.groups, []);
  daily: DailyCache | null = readJSON<DailyCache | null>(KEYS.dailyCache, null);
  coachCompleted: Record<string, boolean> = readJSON(KEYS.coach, {});

  phase: Phase = 'home';
  sheets: Sheet[] = [];
  game: Game | null = null;
  paused = false;
  /** True when the loaded daily is a local stand-in (server unreachable) — unranked. */
  offlineDaily = false;
  loadingPuzzle = false;
  autoPencilPending = false;
  tutor: { hint: TutorHint | null; step: number } | null = null;
  toast: string | null = null;
  /** A newer build is live (see updates.ts). */
  updateReady = false;
  coop: CoopState | null = null;

  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private wasAutoPaused = false;
  /** The co-op game's Game object — never written to the solo saves. */
  private coopGame: Game | null = null;
  private coopSocket: WebSocket | null = null;
  private coopRetry: number | null = null;
  private autoPencilTimer: number | null = null;

  constructor() {
    window.addEventListener(UNAUTHORIZED_EVENT, () => this.signOut());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.enterBackground();
      else this.enterForeground();
    });
    // pagehide is the last reliable moment on iOS when a PWA is swiped away.
    window.addEventListener('pagehide', () => this.saveProgress());
  }

  // --- Plumbing ---

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  emit(): void {
    // Co-op: tell the room about any lifeline this phone has newly used.
    const c = this.coop;
    if (c?.connected && this.game === this.coopGame && this.game)
      for (const k of lifelinesUsed(this.game))
        if (!c.used.includes(k)) {
          this.coopSend({ t: 'used', k });
          c.used = [...c.used, k]; // the room echoes the full list back
        }
    for (const l of this.listeners) l();
  }

  /** Lifelines used in the game on screen — the whole team's, in co-op. */
  get lifelines(): Lifeline[] {
    if (!this.game) return [];
    const mine = lifelinesUsed(this.game);
    if (!this.coop || this.game !== this.coopGame) return mine;
    return [...new Set([...this.coop.used, ...mine])];
  }

  get token(): string | null {
    return this.identity?.token ?? null;
  }

  get todayId(): number {
    return this.daily?.today.id ?? localDailyId();
  }

  showToast(msg: string, ms = 2600): void {
    this.toast = msg;
    this.emit();
    setTimeout(() => {
      if (this.toast === msg) {
        this.toast = null;
        this.emit();
      }
    }, ms);
  }

  // --- Sheets ---

  open(sheet: Sheet): void {
    this.sheets = [...this.sheets, sheet];
    this.emit();
  }

  close(): void {
    this.sheets = this.sheets.slice(0, -1);
    this.emit();
  }

  closeAll(): void {
    this.sheets = [];
    this.emit();
  }

  // --- Preferences ---

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs = { ...this.prefs, [key]: value };
    writeJSON(KEYS.prefs, this.prefs);
    // Co-op always shows right and wrong — both players see the same board.
    if (this.game && key === 'highlightMistakes' && this.game !== this.coopGame)
      this.game.setHighlightMistakes(value as boolean);
    if (this.game && key === 'highlightConstraints') this.game.setHighlightConstraints(value as boolean);
    this.saveProgress();
    this.emit();
  }

  // --- Timer (SPEC §12) ---

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => {
      const g = this.game;
      if (!g || this.paused || this.phase !== 'playing' || g.isSolved) return;
      if (this.coop && !this.coop.started) return; // co-op clock waits for a partner or a first move
      g.elapsedSeconds++;
      // Persist every 5s so a killed tab loses little time.
      if (g.elapsedSeconds % 5 === 0) this.saveProgress();
      this.emit();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.wasAutoPaused = false;
    this.cancelAutoPencil();
    this.saveProgress();
    this.emit();
  }

  private enterBackground(): void {
    this.saveProgress();
    if (this.phase !== 'playing' || this.paused) return;
    // Cancel the interval outright rather than relying on the paused flag —
    // browsers batch throttled timers and can fire a burst on return.
    this.paused = true;
    this.wasAutoPaused = true;
    this.stopTimer();
    this.emit();
  }

  private enterForeground(): void {
    if (this.coop && !this.coopSocket) this.connectCoop();
    void this.refreshDaily();
    if (this.token) void this.refreshGroups();
    if (!this.wasAutoPaused) return;
    this.paused = false;
    this.wasAutoPaused = false;
    this.startTimer();
    this.emit();
  }

  // --- Saves / history ---

  private onSound = (cue: SoundCue) => {
    if (this.prefs.sound) playSound(cue);
  };

  saveProgress(): void {
    const g = this.game;
    if (!g || g.puzzle.id === 0 || g === this.coopGame) return;
    if (g.hasProgress && !g.isSolved) {
      this.saves = {
        ...this.saves,
        [g.puzzle.id]: { puzzle: g.puzzle, ...g.snapshot(), lastPlayedAt: Date.now() },
      };
    } else if (this.saves[g.puzzle.id]) {
      const { [g.puzzle.id]: _gone, ...rest } = this.saves;
      this.saves = rest;
    } else return;
    persistSaves(this.saves);
  }

  get inProgress(): GameSave[] {
    return Object.values(this.saves).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  }

  get mostRecent(): GameSave | null {
    return this.inProgress[0] ?? null;
  }

  resultFor(puzzleId: number): PuzzleResult | undefined {
    return this.history.find((r) => r.puzzleID === puzzleId);
  }

  clearHistory(): void {
    this.history = [];
    persistHistory(this.history);
    this.emit();
  }

  private loadPuzzle(p: Puzzle): void {
    this.saveProgress();
    this.leaveCoop();
    const save = this.saves[p.id];
    const g = new Game(
      p,
      { highlightMistakes: this.prefs.highlightMistakes, highlightConstraints: this.prefs.highlightConstraints },
      save,
    );
    g.onSound = this.onSound;
    this.game = g;
    this.paused = false;
    this.wasAutoPaused = false;
    this.tutor = null;
    this.cancelAutoPencil();
    this.phase = 'playing';
    this.startTimer();
    this.emit();
  }

  resume(save: GameSave): void {
    this.offlineDaily = false;
    this.loadPuzzle(save.puzzle);
  }

  async newGame(difficulty: Difficulty): Promise<void> {
    this.setPref('difficulty', difficulty);
    this.loadingPuzzle = true;
    this.emit();
    try {
      const p = await requestPuzzle(difficulty, nextPuzzleId());
      this.offlineDaily = false;
      this.loadPuzzle(p);
    } finally {
      this.loadingPuzzle = false;
      this.emit();
    }
  }

  /** Open a puzzle a friend shared (/p/<name>), resuming it if already started here. */
  async startShared(name: string): Promise<void> {
    this.loadingPuzzle = true;
    this.emit();
    try {
      const r = await api.shared(name);
      const key = JSON.stringify(r.givens);
      const save = Object.values(this.saves).find((sv) => !isDaily(sv.puzzle) && JSON.stringify(sv.puzzle.givens) === key);
      if (save) this.resume(save);
      else {
        this.offlineDaily = false;
        this.loadPuzzle({ id: nextPuzzleId(), difficulty: r.difficulty, givens: r.givens, solution: r.solution });
      }
      const who = r.shared_by ?? 'A friend';
      this.showToast(
        r.sharer_seconds
          ? `${who} did this ${difficultyLabel[r.difficulty]} puzzle in ${formatTime(r.sharer_seconds)}. Your turn!`
          : `${who} shared this ${difficultyLabel[r.difficulty]} puzzle with you.`,
        5000,
      );
    } catch (e) {
      this.showToast(
        e instanceof ApiError && e.kind === 'offline' ? "You're offline." : "That puzzle link didn't work.",
      );
    } finally {
      this.loadingPuzzle = false;
      this.emit();
    }
  }

  // --- Co-op (SPEC §18) ---

  private selIndex(): number | null {
    const s = this.game?.selected;
    return s ? s.row * 9 + s.col : null;
  }

  /** Join (if new) and open a live co-op game. */
  async startCoop(name: string): Promise<void> {
    if (!this.token) {
      this.open({ kind: 'signIn', then: () => void this.startCoop(name) });
      return;
    }
    this.loadingPuzzle = true;
    this.emit();
    try {
      const d = await api.coopJoin(this.token, name);
      this.saveProgress();
      this.leaveCoop();
      const local = readJSON<CoopLocal>(KEYS.coop, {});
      const id = local[name]?.id ?? nextPuzzleId();
      const g = new Game(
        { id, difficulty: d.difficulty, givens: d.givens, solution: d.solution },
        { highlightMistakes: true, highlightConstraints: this.prefs.highlightConstraints },
      );
      local[name]?.notes?.forEach((n, i) => {
        const cell = g.cells[Math.floor(i / 9)][i % 9];
        if (!cell.isFixed) cell.notes = new Set(n);
      });
      g.onSound = this.onSound;
      this.game = g;
      this.coopGame = g;
      this.coop = {
        name,
        me: this.identity!.user.id,
        players: Object.fromEntries(d.players.map((p) => [p.id, p.display_name ?? 'Player'])),
        online: [],
        sels: {},
        by: Array(81).fill(null),
        started: false,
        connected: false,
        used: [],
      };
      this.saveCoopNotes();
      this.paused = false;
      this.wasAutoPaused = false;
      this.tutor = null;
      this.offlineDaily = false;
      this.cancelAutoPencil();
      this.sheets = [];
      this.phase = 'playing';
      this.startTimer();
      this.connectCoop();
    } catch (e) {
      const d = e instanceof ApiError ? e.detail : undefined;
      this.showToast(
        e instanceof ApiError && e.kind === 'offline'
          ? "You're offline."
          : d === 'game_full'
            ? 'That game already has 4 players.'
            : d === 'game_finished'
              ? "That game's already been solved."
              : "That co-op link didn't work.",
      );
    } finally {
      this.loadingPuzzle = false;
      this.emit();
    }
  }

  private connectCoop(): void {
    const c = this.coop;
    if (!c || !this.token) return;
    if (this.coopRetry !== null) clearTimeout(this.coopRetry);
    this.coopRetry = null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/v1/coop/${c.name}/ws?token=${encodeURIComponent(this.token)}`);
    this.coopSocket = ws;
    ws.onopen = () => {
      if (!this.coop || this.coopSocket !== ws) return;
      this.coop.connected = true;
      this.coopSend({ t: 'sel', i: this.selIndex() });
      this.emit();
    };
    ws.onmessage = (e) => {
      try {
        this.onCoopMessage(JSON.parse(e.data as string) as CoopMsg);
      } catch {
        /* malformed frame */
      }
    };
    ws.onclose = () => {
      if (this.coopSocket !== ws) return;
      this.coopSocket = null;
      if (!this.coop) return;
      this.coop.connected = false;
      this.emit();
      // Keep trying while the game is on screen; returning to the app also reconnects.
      if (!document.hidden) this.coopRetry = window.setTimeout(() => this.connectCoop(), 2000);
    };
  }

  private coopSend(msg: unknown): void {
    if (this.coopSocket?.readyState === WebSocket.OPEN) this.coopSocket.send(JSON.stringify(msg));
  }

  private onCoopMessage(m: CoopMsg): void {
    const c = this.coop;
    const g = this.game;
    if (!c || !g || g !== this.coopGame) return;
    const wasSolved = g.isSolved;
    const at = (i: number) => [Math.floor(i / 9), i % 9] as const;
    switch (m.t) {
      case 'state':
        m.values.forEach((v, i) => g.applyRemote(...at(i), v || null));
        c.by = m.by;
        c.used = m.used ?? [];
        g.mistakeCount = m.mistakes;
        break;
      case 'used':
        c.used = m.used;
        break;
      case 'cell':
        g.applyRemote(...at(m.i), m.v || null);
        c.by = c.by.map((b, k) => (k === m.i ? m.by : b));
        g.mistakeCount = m.mistakes;
        if (m.v) c.started = true; // the server starts the clock on the first number
        if (m.v && m.by && m.by !== c.me && !g.isSolved) this.onSound('place');
        break;
      case 'presence':
        c.players = m.players;
        c.online = m.online;
        c.sels = m.sels;
        c.started = m.started;
        g.elapsedSeconds = m.elapsed;
        break;
      case 'sel':
        c.sels = { ...c.sels, [m.id]: m.i };
        break;
      case 'done': {
        g.elapsedSeconds = m.elapsed;
        g.mistakeCount = m.mistakes;
        const r = this.resultFor(g.puzzle.id);
        if (r) {
          r.elapsedSeconds = m.elapsed;
          r.mistakes = m.mistakes;
          r.lifelines = this.lifelines;
          persistHistory(this.history);
        }
        break;
      }
    }
    // Solved by anyone (or already solved when we arrived): record it once.
    if (!wasSolved && g.isSolved && !this.resultFor(g.puzzle.id)) this.onSolved(g);
    this.emit();
  }

  private saveCoopNotes(): void {
    const c = this.coop;
    const g = this.coopGame;
    if (!c || !g) return;
    const local = readJSON<CoopLocal>(KEYS.coop, {});
    local[c.name] = { id: g.puzzle.id, notes: g.cells.flat().map((x) => [...x.notes]), at: Date.now() };
    // The 20 most recent games are plenty.
    writeJSON(KEYS.coop, Object.fromEntries(Object.entries(local).sort((a, b) => b[1].at - a[1].at).slice(0, 20)));
  }

  leaveCoop(): void {
    if (!this.coop) return;
    this.saveCoopNotes();
    this.coop = null;
    const ws = this.coopSocket;
    this.coopSocket = null;
    ws?.close();
    if (this.coopRetry !== null) clearTimeout(this.coopRetry);
    this.coopRetry = null;
  }

  /** Resolve today's daily (cache → server → local stand-in) and play it. */
  async startDaily(): Promise<void> {
    this.loadingPuzzle = true;
    this.emit();
    try {
      let today = this.cachedToday();
      if (!today) {
        await this.refreshDaily();
        today = this.cachedToday();
      }
      if (today) {
        this.offlineDaily = false;
        this.loadPuzzle(today);
      } else {
        // Offline with no cache: a local puzzle under today's id so the
        // player has *something*. Marked unranked; never posted.
        const p = await requestPuzzle('medium', localDailyId());
        this.offlineDaily = true;
        this.loadPuzzle(p);
      }
    } finally {
      this.loadingPuzzle = false;
      this.emit();
    }
  }

  /** Play a past daily from the server (or resume its save). */
  async startPastDaily(puzzleId: number): Promise<void> {
    const save = this.saves[puzzleId];
    if (save) return this.resume(save);
    this.loadingPuzzle = true;
    this.emit();
    try {
      const p = toPuzzle(await api.daily(puzzleId));
      this.offlineDaily = false;
      this.loadPuzzle(p);
    } catch (e) {
      this.showToast(e instanceof ApiError && e.kind === 'offline' ? "You're offline." : "Couldn't load that puzzle.");
    } finally {
      this.loadingPuzzle = false;
      this.emit();
    }
  }

  private cachedToday(): Puzzle | null {
    const d = this.daily;
    if (!d) return null;
    const local = localDailyId();
    // The server's "today" is Sydney time; within a day of the device's date
    // is close enough. Tomorrow's cached puzzle covers the midnight rollover.
    if (Math.abs(d.today.id - local) <= 1 && d.today.id >= local) return d.today;
    if (d.tomorrow.id === local) return d.tomorrow;
    if (Math.abs(d.today.id - local) <= 1) return d.today;
    return null;
  }

  async refreshDaily(): Promise<void> {
    try {
      const r = await api.dailyToday();
      this.daily = { today: toPuzzle(r.today), tomorrow: toPuzzle(r.tomorrow), fetchedAt: Date.now() };
      writeJSON(KEYS.dailyCache, this.daily);
      this.emit();
    } catch {
      /* cached / fallback daily still works */
    }
  }

  goHome(): void {
    this.saveProgress();
    this.leaveCoop();
    this.cancelAutoPencil();
    this.tutor = null;
    this.phase = 'home';
    this.stopTimer();
    this.emit();
  }

  confirmReset(): void {
    this.game?.reset();
    this.paused = false;
    this.saveProgress();
    this.startTimer();
    this.emit();
  }

  // --- Moves (each saves + checks for solve) ---

  /** Wrap a game mutation: cancels a pending auto-pencil, saves, detects the solve. */
  act(fn: (g: Game) => void): void {
    const g = this.game;
    if (!g || this.paused || g.isSolved) return;
    if (this.coop && !this.coop.connected) {
      this.showToast('Reconnecting to the game…');
      return;
    }
    const before = JSON.stringify(g.snapshot().cells.map((r) => r.map((c) => [c.value, [...c.notes]])));
    const values = this.coop ? g.cells.flat().map((c) => c.value) : null;
    const sel = this.selIndex();
    fn(g);
    const after = JSON.stringify(g.snapshot().cells.map((r) => r.map((c) => [c.value, [...c.notes]])));
    if (before !== after) this.cancelAutoPencil();
    if (values) {
      // Co-op: numbers go to the room; notes stay on this phone.
      g.cells.flat().forEach((c, i) => {
        if (c.value !== values[i]) this.coopSend(c.value === null ? { t: 'clear', i } : { t: 'place', i, v: c.value });
      });
      if (this.selIndex() !== sel) this.coopSend({ t: 'sel', i: this.selIndex() });
      this.saveCoopNotes();
    }
    if (g.isSolved) this.onSolved(g);
    else this.saveProgress();
    this.emit();
  }

  private onSolved(g: Game): void {
    this.stopTimer();
    this.tutor = null;
    const result: PuzzleResult = {
      puzzleID: g.puzzle.id,
      completedAt: Date.now(),
      elapsedSeconds: g.elapsedSeconds,
      mistakes: g.mistakeCount,
      puzzle: g.puzzle,
      lifelines: this.lifelines,
    };
    this.history = [result, ...this.history.filter((r) => r.puzzleID !== g.puzzle.id)];
    persistHistory(this.history);
    this.saveProgress(); // solved → removes the save
    const ranked = isDaily(g.puzzle) && !this.offlineDaily && !this.coop;
    this.sheets = [{ kind: 'solved', rank: null, wasRanked: ranked }];
    if (ranked) {
      void this.submitScore({
        puzzle_id: g.puzzle.id,
        elapsed_seconds: g.elapsedSeconds,
        mistakes: g.mistakeCount,
        hints_used: g.hintsUsed,
        pencil_assists_used: g.pencilAssistsUsed,
        highlight_mistakes_was_on: g.highlightMistakesEverOn,
        highlight_rules_was_on: g.highlightConstraintsEverOn,
      });
    }
  }

  // --- Assists ---

  tapAutoPencil(): void {
    if (!this.game || this.paused || this.game.isSolved) return;
    this.cancelAutoPencil();
    this.autoPencilPending = true;
    // 3s cancel window so the player never sees marks they're about to undo (SPEC §13.11).
    this.autoPencilTimer = window.setTimeout(() => {
      this.autoPencilTimer = null;
      this.autoPencilPending = false;
      if (this.game?.autoPencil()) this.saveProgress();
      this.emit();
    }, 3000);
    this.emit();
  }

  cancelAutoPencil(): void {
    if (this.autoPencilTimer !== null) clearTimeout(this.autoPencilTimer);
    this.autoPencilTimer = null;
    if (this.autoPencilPending) {
      this.autoPencilPending = false;
      this.emit();
    }
  }

  openTutor(): void {
    const g = this.game;
    if (!g || this.paused || g.isSolved) return;
    const hint = findHint(g.cells);
    // Charged on peek, not on apply — the idea is in their head either way.
    if (hint) {
      g.noteHintViewed();
      this.saveProgress();
    }
    this.tutor = { hint, step: 0 };
    this.emit();
  }

  tutorStep(delta: number): void {
    if (!this.tutor?.hint) return;
    const n = this.tutor.hint.steps.length;
    this.tutor = { ...this.tutor, step: Math.max(0, Math.min(n - 1, this.tutor.step + delta)) };
    this.emit();
  }

  applyTutor(): void {
    const hint = this.tutor?.hint;
    this.tutor = null;
    if (hint) this.act((g) => g.applyTutorHint(hint));
    else this.emit();
  }

  closeTutor(): void {
    this.tutor = null;
    this.emit();
  }

  // --- Identity ---

  async startSignIn(email: string): Promise<void> {
    await api.authStart(email.trim().toLowerCase());
    writeJSON(KEYS.pendingSignIn, { email: email.trim(), sentAt: Date.now() });
  }

  /**
   * A code sent in the last 15 minutes (its lifetime on the server) that
   * hasn't been used yet. Fetching the code means leaving the app for the
   * mail app, and the phone often throws the page away meanwhile — so the
   * sign-in sheet must be able to come back at "Enter code" rather than
   * starting over. Starting over sends a new code, which cancels the one
   * already in the inbox (Derek's dad got stuck in exactly that loop,
   * 30 Oct 2026).
   */
  pendingSignIn(): { email: string; sentAt: number } | null {
    const p = readJSON<{ email: string; sentAt: number } | null>(KEYS.pendingSignIn, null);
    if (!p || this.token || Date.now() - p.sentAt > 15 * 60 * 1000) return null;
    return p;
  }

  clearPendingSignIn(): void {
    writeJSON(KEYS.pendingSignIn, null);
  }

  /** Returns true when the new account still needs a display name. */
  async verifySignIn(email: string, code: string): Promise<boolean> {
    const r = await api.authVerify(email.trim().toLowerCase(), code.trim());
    this.identity = { user: r.user, token: r.token };
    writeJSON(KEYS.identity, this.identity);
    this.clearPendingSignIn();
    this.emit();
    void this.afterSignIn();
    return r.needs_display_name || !r.user.display_name;
  }

  async setDisplayName(name: string): Promise<void> {
    if (!this.token) return;
    const user = await api.putMe(this.token, name.trim());
    this.identity = { ...this.identity!, user };
    writeJSON(KEYS.identity, this.identity);
    this.emit();
  }

  private async afterSignIn(): Promise<void> {
    await Promise.all([this.refreshGroups(), this.flushPending(), this.syncRemoteHistory()]);
  }

  signOut(): void {
    this.identity = null;
    this.groups = [];
    writeJSON(KEYS.identity, null);
    writeJSON(KEYS.groups, null);
    this.emit();
  }

  async deleteAccount(): Promise<void> {
    if (!this.token) return;
    await api.deleteMe(this.token);
    this.signOut();
  }

  async refreshGroups(): Promise<void> {
    if (!this.token) return;
    try {
      this.groups = await api.meGroups(this.token);
      writeJSON(KEYS.groups, this.groups);
      this.emit();
    } catch {
      /* keep the cached list */
    }
  }

  /** Pull completed dailies from the server so a new device shows its history. Local wins on conflict. */
  async syncRemoteHistory(): Promise<void> {
    if (!this.token) return;
    try {
      const remote = await api.meScores(this.token);
      const have = new Set(this.history.map((r) => r.puzzleID));
      const added = remote
        .filter((s) => !have.has(s.puzzle_id))
        .map(
          (s): PuzzleResult => ({
            puzzleID: s.puzzle_id,
            completedAt: s.completed_at,
            elapsedSeconds: s.elapsed_seconds,
            mistakes: s.mistakes,
            puzzle: { id: s.puzzle_id, difficulty: s.difficulty, givens: s.givens, solution: s.solution },
          }),
        );
      if (!added.length) return;
      this.history = [...this.history, ...added].sort((a, b) => b.completedAt - a.completedAt);
      persistHistory(this.history);
      this.emit();
    } catch {
      /* best effort */
    }
  }

  // --- Scores ---

  private async submitScore(s: ScoreSubmission): Promise<void> {
    if (!this.token) {
      this.enqueue(s);
      return;
    }
    try {
      const rank = await api.postScore(this.token, s);
      const top = this.sheets[this.sheets.length - 1];
      if (top?.kind === 'solved') {
        this.sheets = [...this.sheets.slice(0, -1), { ...top, rank }];
        this.emit();
      }
    } catch {
      this.enqueue(s);
    }
  }

  private enqueue(s: ScoreSubmission): void {
    const q = readJSON<Pending[]>(KEYS.pendingScores, []);
    q.push({ ...s, completed_at: Date.now() });
    writeJSON(KEYS.pendingScores, q);
  }

  async flushPending(): Promise<void> {
    if (!this.token) return;
    const q = readJSON<Pending[]>(KEYS.pendingScores, []);
    if (!q.length) return;
    const remaining: Pending[] = [];
    for (const item of q) {
      try {
        const { completed_at: _c, ...s } = item;
        await api.postScore(this.token, s);
      } catch (e) {
        // Retry only transient failures; a 4xx will never succeed.
        if (e instanceof ApiError && (e.kind === 'offline' || e.status >= 500)) remaining.push(item);
      }
    }
    writeJSON(KEYS.pendingScores, remaining);
  }

  // --- Coach ---

  markCoachComplete(technique: string): void {
    this.coachCompleted = { ...this.coachCompleted, [technique]: true };
    writeJSON(KEYS.coach, this.coachCompleted);
    this.emit();
  }

  // --- Launch ---

  async launch(): Promise<void> {
    // Came back from the mail app to a fresh page: pick the sign-in up where it was.
    if (this.pendingSignIn() && !this.sheets.some((s) => s.kind === 'signIn')) this.open({ kind: 'signIn' });
    await Promise.all([
      this.refreshDaily(),
      this.token ? this.refreshGroups() : null,
      this.token ? this.flushPending() : null,
      this.token ? this.syncRemoteHistory() : null,
    ]);
  }
}

export const store = new Store();

export function useStore(): Store {
  const [, force] = useReducer((n: number, _: void) => n + 1, 0);
  useEffect(() => store.subscribe(() => force()), []);
  return store;
}
