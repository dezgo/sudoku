// App-wide state: the iOS ContentView + its stores (GameStore, PuzzleHistory,
// AuthStore, GroupsStore, DailyPuzzleStore, ScoresStore) folded into one
// observable object. Components call `useStore()` and re-render on any
// change — the state is small enough that finer-grained subscriptions would
// be complexity without a payoff.

import { useEffect, useReducer } from 'preact/hooks';
import { Game, type SoundCue } from '../engine/game';
import { isDaily, type Difficulty, type Puzzle } from '../engine/types';
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
import { localDailyId } from '../lib/format';

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
  | { kind: 'confirmReset' };

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

  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private wasAutoPaused = false;
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
    for (const l of this.listeners) l();
  }

  get token(): string | null {
    return this.identity?.token ?? null;
  }

  get todayId(): number {
    return this.daily?.today.id ?? localDailyId();
  }

  showToast(msg: string): void {
    this.toast = msg;
    this.emit();
    setTimeout(() => {
      if (this.toast === msg) {
        this.toast = null;
        this.emit();
      }
    }, 2600);
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
    if (this.game && key === 'highlightMistakes') this.game.setHighlightMistakes(value as boolean);
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
    if (!g || g.puzzle.id === 0) return;
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
    const before = JSON.stringify(g.snapshot().cells.map((r) => r.map((c) => [c.value, [...c.notes]])));
    fn(g);
    const after = JSON.stringify(g.snapshot().cells.map((r) => r.map((c) => [c.value, [...c.notes]])));
    if (before !== after) this.cancelAutoPencil();
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
    };
    this.history = [result, ...this.history.filter((r) => r.puzzleID !== g.puzzle.id)];
    persistHistory(this.history);
    this.saveProgress(); // solved → removes the save
    const ranked = isDaily(g.puzzle) && !this.offlineDaily;
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
  }

  /** Returns true when the new account still needs a display name. */
  async verifySignIn(email: string, code: string): Promise<boolean> {
    const r = await api.authVerify(email.trim().toLowerCase(), code.trim());
    this.identity = { user: r.user, token: r.token };
    writeJSON(KEYS.identity, this.identity);
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
