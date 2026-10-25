import { useEffect } from 'preact/hooks';
import { store, useStore, type Sheet } from './store';
import { warmBuffers } from './puzzles';
import { applyUpdate, startUpdateChecks } from './updates';
import { api } from '../lib/api';
import { applyColors } from '../lib/colors';
import { Home } from '../ui/Home';
import { Play } from '../ui/Play';
import { CoachSheet } from '../ui/Coach';
import { HistorySheet } from '../ui/History';
import { MultiplayerSheet } from '../ui/Multiplayer';
import { CompletedSheet, ConfirmResetSheet, GamesSheet, NewGameSheet, SolvedSheet } from '../ui/sheets';
import { GroupMembersSheet, GroupOnboardingSheet, LeaderboardSheet, SettingsSheet, SignInSheet } from '../ui/social';

function renderSheet(sheet: Sheet, i: number) {
  switch (sheet.kind) {
    case 'newGame':
      return <NewGameSheet key={i} />;
    case 'games':
      return <GamesSheet key={i} />;
    case 'settings':
      return <SettingsSheet key={i} />;
    case 'signIn':
      return <SignInSheet key={i} then={sheet.then} />;
    case 'solved':
      return <SolvedSheet key={i} rank={sheet.rank} wasRanked={sheet.wasRanked} />;
    case 'completed':
      return <CompletedSheet key={i} result={sheet.result} fanfare={sheet.fanfare} />;
    case 'leaderboard':
      return <LeaderboardSheet key={i} puzzleId={sheet.puzzleId} />;
    case 'groupMembers':
      return <GroupMembersSheet key={i} group={sheet.group} />;
    case 'groupOnboarding':
      return <GroupOnboardingSheet key={i} mode={sheet.mode} />;
    case 'coach':
      return <CoachSheet key={i} />;
    case 'history':
      return <HistorySheet key={i} />;
    case 'multiplayer':
      return <MultiplayerSheet key={i} gameId={sheet.gameId} />;
    case 'confirmReset':
      return <ConfirmResetSheet key={i} />;
  }
}

/** `/play/?join=CODE` — the web counterpart of the apps' /m/<code> universal link. */
function handleJoinLink() {
  const params = new URLSearchParams(location.search);
  const code = params.get('join');
  if (!code) return;
  history.replaceState(null, '', location.pathname);
  const join = async () => {
    try {
      const g = await api.mpJoinByCode(store.token!, code.toUpperCase());
      store.open({ kind: 'multiplayer', gameId: g.id });
    } catch {
      store.showToast("Couldn't join that game — it may have started or ended.");
      store.open({ kind: 'multiplayer' });
    }
  };
  if (store.token) void join();
  else store.open({ kind: 'signIn', then: () => void join() });
}

export function App() {
  const s = useStore();

  useEffect(() => {
    void s.launch();
    warmBuffers();
    startUpdateChecks();
    handleJoinLink();
  }, []);

  // Chosen colours go on <html> inline, so they win in light and dark alike.
  useEffect(() => applyColors(s.prefs.colors), [s.prefs.colors]);

  // Appearance: "system" leaves the media query in charge.
  useEffect(() => {
    const root = document.documentElement;
    if (s.prefs.appearance === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.prefs.appearance);
  }, [s.prefs.appearance]);

  return (
    <>
      {s.updateReady && (
        <div class="update-bar" role="status">
          <span>A new version of Sudoku Crew is ready — tap to get it.</span>
          <button class="btn compact primary" onClick={applyUpdate}>
            Update
          </button>
        </div>
      )}
      {s.phase === 'playing' && s.game ? <Play /> : <Home />}
      {s.sheets.map(renderSheet)}
      {s.loadingPuzzle && (
        <div class="veil">
          <div class="card">
            <div class="spinner" style={{ margin: '0 auto 10px' }} />
            Building your puzzle…
          </div>
        </div>
      )}
      {s.toast && (
        <div class="toast" role="status">
          {s.toast}
        </div>
      )}
    </>
  );
}
