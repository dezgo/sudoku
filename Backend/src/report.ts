// Usage report: who played, how often, what they played and which features
// they used. One builder feeds both the Monday email (cron) and the private
// stats page at /stats (admins only, via GET /v1/admin/report).
//
// Sources: usage_events/devices (web app, from Nov 2026) and scores (every
// finished daily, including any still coming from the old store apps).

import type { Env } from './types';
import { jsonError, jsonOk } from './http';
import { requireAuth } from './auth';
import { addDays, dateInTimezone } from './daily';

const DAY = 24 * 60 * 60 * 1000;

export interface Report {
  from: number;
  to: number;
  days: number;
  trackingSince: number | null;
  devices: {
    total: number;
    prev: number;
    signedIn: number;
    anonymous: number;
    installed: number;
    browser: number;
    byPlatform: Record<string, number>;
    avgPerDay: number;
  };
  people: { total: number; prev: number };
  players: { name: string; daysActive: number; dailies: number; otherGames: number; lastActive: number }[];
  quiet: { name: string; lastActive: number; dailiesTotal: number }[];
  newUsers: { name: string; joined: number; dailies: number }[];
  anonDevices: { platform: string; installed: boolean; daysActive: number; started: number; finished: number }[];
  dailiesSolved: number;
  dailiesSolvedPrev: number;
  games: { mode: string; difficulty: string; started: number; resumed: number; finished: number }[];
  features: { name: string; uses: number; devices: number }[];
  settings: { name: string; uses: number; devices: number }[];
  screens: { name: string; uses: number; devices: number }[];
  feedback: { at: number; who: string; message: string }[];
  /** Every day in the period, oldest first ('YYYY-MM-DD'). */
  dayList: string[];
  /**
   * "Who played when": one row per person or account-less device. A mark is
   * 'daily' if they finished that day's daily (or any daily, for an account-
   * less device), 'played' if they only opened the app or played something else.
   */
  grid: {
    name: string;
    kind: 'player' | 'anon' | 'quiet';
    marks: Record<string, 'daily' | 'played'>;
    daysActive: number;
    dailies: number;
    otherGames: number;
    lastActive: number | null;
  }[];
  /** People active on each day of dayList (signed-in players + account-less devices). */
  perDay: number[];
}

interface Ev {
  device_id: string;
  user_id: string | null;
  kind: string;
  detail: string | null;
  day: string;
  created_at: number;
}

/** Midnight at the start of `day` ('YYYY-MM-DD') in `tz`, as unix-millis. */
export function startOfDay(day: string, tz: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(utcMidnight);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const offset = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - utcMidnight;
  return utcMidnight - offset;
}

/**
 * Whole days in the daily's timezone: the `days` days ending with `lastDay`
 * (inclusive), compared with the same number of days just before.
 */
export async function buildReport(env: Env, lastDay: string, days: number): Promise<Report> {
  const tz = env.DAILY_TIMEZONE;
  const from = startOfDay(addDays(lastDay, 1 - days), tz);
  const to = startOfDay(addDays(lastDay, 1), tz);
  const prevFrom = startOfDay(addDays(lastDay, 1 - 2 * days), tz);
  const db = env.DB;

  const [evRes, prevRes, devRes, userRes, scoreRes, prevScores, fbRes, since] = await Promise.all([
    db
      .prepare('SELECT device_id, user_id, kind, detail, day, created_at FROM usage_events WHERE created_at >= ? AND created_at < ?')
      .bind(from, to)
      .all<Ev>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT device_id) AS devices,
                COUNT(DISTINCT user_id) AS users,
                COUNT(DISTINCT CASE WHEN user_id IS NULL THEN device_id END) AS anon
         FROM usage_events WHERE kind = 'open' AND created_at >= ? AND created_at < ?`,
      )
      .bind(prevFrom, from)
      .first<{ devices: number; users: number; anon: number }>(),
    db.prepare('SELECT device_id, user_id, platform, standalone FROM devices WHERE last_seen_at >= ?').bind(from).all<{
      device_id: string;
      user_id: string | null;
      platform: string | null;
      standalone: number;
    }>(),
    db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.created_at,
                MAX(u.last_seen_at,
                    COALESCE((SELECT MAX(completed_at) FROM scores s WHERE s.user_id = u.id), 0),
                    COALESCE((SELECT MAX(created_at) FROM usage_events e WHERE e.user_id = u.id), 0)) AS last_active,
                (SELECT COUNT(*) FROM scores s WHERE s.user_id = u.id) AS dailies_total
         FROM users u`,
      )
      .all<{ id: string; email: string; display_name: string | null; created_at: number; last_active: number; dailies_total: number }>(),
    db
      .prepare('SELECT user_id, completed_at FROM scores WHERE completed_at >= ? AND completed_at < ?')
      .bind(from, to)
      .all<{ user_id: string; completed_at: number }>(),
    db
      .prepare('SELECT COUNT(*) AS n FROM scores WHERE completed_at >= ? AND completed_at < ?')
      .bind(prevFrom, from)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT f.created_at, f.message, f.reply_to, u.display_name
         FROM feedback f LEFT JOIN users u ON u.id = f.user_id
         WHERE f.created_at >= ? AND f.created_at < ? ORDER BY f.created_at`,
      )
      .bind(from, to)
      .all<{ created_at: number; message: string; reply_to: string | null; display_name: string | null }>(),
    db.prepare('SELECT MIN(created_at) AS t FROM usage_events').first<{ t: number | null }>(),
  ]);

  const events = evRes.results;
  const users = new Map(userRes.results.map((u) => [u.id, u]));
  const nameOf = (id: string) => {
    const u = users.get(id);
    return u?.display_name || u?.email || 'Deleted account';
  };
  const detail = (e: Ev): Record<string, unknown> => {
    try {
      return e.detail ? (JSON.parse(e.detail) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  // A device belongs to whoever last signed in on it — so a phone used signed
  // out for a while, then signed in, still counts as that one person.
  const deviceUser = new Map<string, string | null>();
  for (const d of devRes.results) deviceUser.set(d.device_id, d.user_id);
  for (const e of events) if (e.user_id) deviceUser.set(e.device_id, e.user_id);

  // --- Devices and people ---
  const opens = events.filter((e) => e.kind === 'open');
  const activeDevices = new Set(events.map((e) => e.device_id));
  const deviceDays = new Map<string, Set<string>>();
  for (const e of events) {
    if (!deviceDays.has(e.device_id)) deviceDays.set(e.device_id, new Set());
    deviceDays.get(e.device_id)!.add(e.day);
  }
  const devInfo = new Map(devRes.results.map((d) => [d.device_id, d]));
  const byPlatform: Record<string, number> = {};
  let installed = 0;
  let signedInDevices = 0;
  for (const id of activeDevices) {
    const d = devInfo.get(id);
    const p = d?.platform ?? 'unknown';
    byPlatform[p] = (byPlatform[p] ?? 0) + 1;
    if (d?.standalone) installed++;
    if (deviceUser.get(id)) signedInDevices++;
  }
  const dayDevicePairs = new Set(opens.map((e) => `${e.day}|${e.device_id}`)).size;

  // Per signed-in person: active days from the app and from finished dailies.
  const personDays = new Map<string, Set<string>>();
  const addDay = (uid: string, day: string) => {
    if (!personDays.has(uid)) personDays.set(uid, new Set());
    personDays.get(uid)!.add(day);
  };
  for (const e of events) {
    const uid = deviceUser.get(e.device_id);
    if (uid) addDay(uid, e.day);
  }
  const dailies = new Map<string, number>();
  const dailyDays = new Map<string, Set<string>>();
  for (const s of scoreRes.results) {
    const day = dateInTimezone(new Date(s.completed_at), tz);
    addDay(s.user_id, day);
    dailies.set(s.user_id, (dailies.get(s.user_id) ?? 0) + 1);
    if (!dailyDays.has(s.user_id)) dailyDays.set(s.user_id, new Set());
    dailyDays.get(s.user_id)!.add(day);
  }
  const otherGames = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== 'game_finish') continue;
    const mode = detail(e).mode;
    if (mode === 'daily' || mode === 'past_daily') continue; // already counted from scores
    const uid = deviceUser.get(e.device_id);
    if (uid) otherGames.set(uid, (otherGames.get(uid) ?? 0) + 1);
  }
  const players = [...personDays.keys()]
    .map((uid) => ({
      name: nameOf(uid),
      daysActive: personDays.get(uid)!.size,
      dailies: dailies.get(uid) ?? 0,
      otherGames: otherGames.get(uid) ?? 0,
      lastActive: users.get(uid)?.last_active ?? 0,
    }))
    .sort((a, b) => b.daysActive - a.daysActive || b.dailies - a.dailies);

  const anonIds = [...activeDevices].filter((id) => !deviceUser.get(id));
  const anonDevices = anonIds
    .map((id) => {
      const d = devInfo.get(id);
      const mine = events.filter((e) => e.device_id === id);
      return {
        platform: d?.platform ?? 'unknown',
        installed: !!d?.standalone,
        daysActive: deviceDays.get(id)?.size ?? 0,
        started: mine.filter((e) => e.kind === 'game_start').length,
        finished: mine.filter((e) => e.kind === 'game_finish').length,
      };
    })
    .sort((a, b) => b.daysActive - a.daysActive || b.finished - a.finished);

  // Gone quiet: a regular (5+ dailies ever) with nothing in the last week.
  const quiet = userRes.results
    .filter((u) => u.dailies_total >= 5 && u.last_active < Date.now() - 7 * DAY && u.last_active > Date.now() - 90 * DAY)
    .map((u) => ({ name: u.display_name || u.email, lastActive: u.last_active, dailiesTotal: u.dailies_total }))
    .sort((a, b) => b.lastActive - a.lastActive);

  const newUsers = userRes.results
    .filter((u) => u.created_at >= from && u.created_at < to)
    .map((u) => ({ name: u.display_name || u.email, joined: u.created_at, dailies: dailies.get(u.id) ?? 0 }));

  // --- Games ---
  const gameKey = new Map<string, { mode: string; difficulty: string; started: number; resumed: number; finished: number }>();
  for (const e of events) {
    if (e.kind !== 'game_start' && e.kind !== 'game_resume' && e.kind !== 'game_finish') continue;
    const d = detail(e);
    const mode = String(d.mode ?? 'unknown');
    const difficulty = String(d.difficulty ?? '');
    const k = `${mode}|${difficulty}`;
    if (!gameKey.has(k)) gameKey.set(k, { mode, difficulty, started: 0, resumed: 0, finished: 0 });
    const g = gameKey.get(k)!;
    if (e.kind === 'game_start') g.started++;
    else if (e.kind === 'game_resume') g.resumed++;
    else g.finished++;
  }
  const modeOrder = ['daily', 'past_daily', 'practice', 'shared', 'coop'];
  const diffOrder = ['easy', 'medium', 'hard', 'expert'];
  const rank = (list: string[], v: string) => (list.includes(v) ? list.indexOf(v) : list.length);
  const games = [...gameKey.values()].sort(
    (a, b) => rank(modeOrder, a.mode) - rank(modeOrder, b.mode) || rank(diffOrder, a.difficulty) - rank(diffOrder, b.difficulty),
  );

  // --- Features, settings, screens ---
  const tally = (kind: string, label: (d: Record<string, unknown>) => string) => {
    const m = new Map<string, { uses: number; devices: Set<string> }>();
    for (const e of events) {
      if (e.kind !== kind) continue;
      const name = label(detail(e));
      if (!m.has(name)) m.set(name, { uses: 0, devices: new Set() });
      const t = m.get(name)!;
      t.uses++;
      t.devices.add(e.device_id);
    }
    return [...m.entries()]
      .map(([name, t]) => ({ name, uses: t.uses, devices: t.devices.size }))
      .sort((a, b) => b.devices - a.devices || b.uses - a.uses);
  };
  const features = tally('feature', (d) => String(d.f ?? 'unknown'));
  const settings = tally('setting', (d) =>
    d.value === undefined ? String(d.key) : `${String(d.key)} → ${String(d.value)}`,
  );
  const screens = tally('screen', (d) => String(d.s ?? 'unknown'));

  const feedback = fbRes.results.map((f) => ({
    at: f.created_at,
    who: f.display_name ?? f.reply_to ?? 'anonymous',
    message: f.message,
  }));

  const people = new Set([...activeDevices].map((id) => deviceUser.get(id) ?? `device:${id}`));
  for (const uid of personDays.keys()) people.add(uid);

  // Same count for the period before, so the headline can say up or down.
  const [prevEv, prevSc] = await Promise.all([
    db
      .prepare('SELECT DISTINCT e.device_id, COALESCE(e.user_id, d.user_id) AS user_id FROM usage_events e LEFT JOIN devices d ON d.device_id = e.device_id WHERE e.created_at >= ? AND e.created_at < ?')
      .bind(prevFrom, from)
      .all<{ device_id: string; user_id: string | null }>(),
    db
      .prepare('SELECT DISTINCT user_id FROM scores WHERE completed_at >= ? AND completed_at < ?')
      .bind(prevFrom, from)
      .all<{ user_id: string }>(),
  ]);
  const prevPeople = new Set([
    ...prevEv.results.map((r) => r.user_id ?? `device:${r.device_id}`),
    ...prevSc.results.map((r) => r.user_id),
  ]);

  // --- Who played when ---
  const dayList = Array.from({ length: days }, (_, i) => addDays(lastDay, i + 1 - days));
  const quietNames = new Set(quiet.map((q) => q.name));
  const grid: Report['grid'] = [];
  for (const uid of personDays.keys()) {
    const marks: Record<string, 'daily' | 'played'> = {};
    for (const d of personDays.get(uid)!) marks[d] = dailyDays.get(uid)?.has(d) ? 'daily' : 'played';
    const name = nameOf(uid);
    grid.push({
      name,
      kind: quietNames.has(name) ? 'quiet' : 'player',
      marks,
      daysActive: personDays.get(uid)!.size,
      dailies: dailies.get(uid) ?? 0,
      otherGames: otherGames.get(uid) ?? 0,
      lastActive: users.get(uid)?.last_active ?? null,
    });
  }
  const sameName = new Map<string, number>();
  for (const id of anonIds) {
    const d = devInfo.get(id);
    const marks: Record<string, 'daily' | 'played'> = {};
    for (const day of deviceDays.get(id) ?? []) marks[day] = 'played';
    let finished = 0;
    for (const e of events) {
      if (e.device_id !== id || e.kind !== 'game_finish') continue;
      finished++;
      const mode = detail(e).mode;
      if (mode === 'daily' || mode === 'past_daily') marks[e.day] = 'daily';
    }
    const base = `${PLATFORM_LABEL[d?.platform ?? 'unknown'] ?? 'Device'}${d?.standalone ? ' app' : ''}`;
    const n = (sameName.get(base) ?? 0) + 1;
    sameName.set(base, n);
    grid.push({
      name: n > 1 ? `${base} ${n}` : base,
      kind: 'anon',
      marks,
      daysActive: deviceDays.get(id)?.size ?? 0,
      dailies: Object.values(marks).filter((m) => m === 'daily').length,
      otherGames: finished,
      lastActive: d ? Math.max(...events.filter((e) => e.device_id === id).map((e) => e.created_at)) : null,
    });
  }
  for (const q of quiet)
    if (!grid.some((g) => g.name === q.name))
      grid.push({ name: q.name, kind: 'quiet', marks: {}, daysActive: 0, dailies: 0, otherGames: 0, lastActive: q.lastActive });
  const kindOrder = { player: 0, anon: 1, quiet: 2 };
  grid.sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      b.daysActive - a.daysActive ||
      b.dailies - a.dailies ||
      (b.lastActive ?? 0) - (a.lastActive ?? 0),
  );
  const perDay = dayList.map((d) => grid.filter((g) => g.marks[d]).length);

  return {
    from,
    to,
    days,
    trackingSince: since?.t ?? null,
    devices: {
      total: activeDevices.size,
      prev: prevRes?.devices ?? 0,
      signedIn: signedInDevices,
      anonymous: anonIds.length,
      installed,
      browser: activeDevices.size - installed,
      byPlatform,
      // Averaged only over the days tracking has been running.
      avgPerDay:
        Math.round((dayDevicePairs / Math.max(1, Math.min(days, Math.ceil((Math.min(to, Date.now()) - Math.max(from, since?.t ?? to)) / DAY)))) * 10) / 10,
    },
    people: { total: people.size, prev: prevPeople.size },
    players,
    quiet,
    newUsers,
    anonDevices,
    dailiesSolved: scoreRes.results.length,
    dailiesSolvedPrev: prevScores?.n ?? 0,
    games,
    features,
    settings,
    screens,
    feedback,
    dayList,
    grid,
    perDay,
  };
}

// --- Labels -----------------------------------------------------------------

const MODE_LABEL: Record<string, string> = {
  daily: "Today's daily",
  past_daily: 'Past daily',
  practice: 'Practice',
  shared: 'Shared puzzle',
  coop: 'Co-op',
};
const FEATURE_LABEL: Record<string, string> = {
  hint: 'Hint (wand)',
  auto_pencil: 'Auto-pencil',
  pencil_on: 'Pencil mode on',
  speed_on: 'Speed mode on',
  coach_lesson: 'Coach lesson opened',
  coach_example: 'Coach: Show me an example',
  coach_show_me: 'Coach: Show me',
  coach_done: 'Coach lesson finished',
  rated: 'Rated a game',
  crew_try: 'Tried a game from the crew',
  invite: 'Invited a friend',
  joined_by_link: 'Joined a group from a link',
  share: 'Shared a puzzle',
  coop_create: 'Started a co-op game',
  undo: 'Undo',
};
const SCREEN_LABEL: Record<string, string> = {
  coach: 'Coach',
  history: 'History calendar',
  leaderboard: 'Leaderboard',
  multiplayer: 'Multiplayer',
  settings: 'Settings',
  feedback: 'Feedback form',
  games: 'Saved games',
  newGame: 'New game',
  share: 'Share',
  groupMembers: 'Group members',
  crew: 'Crew feed',
};
const PLATFORM_LABEL: Record<string, string> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  computer: 'Computer',
  unknown: 'Unknown',
};

/** Calendar days in the daily's timezone, so 11pm yesterday reads "yesterday". */
function ago(t: number, now: number, tz: string): string {
  if (!t) return 'never';
  const day = (x: number) => Date.parse(dateInTimezone(new Date(x), tz));
  const d = Math.round((day(now) - day(t)) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function delta(now: number, prev: number): string {
  if (!prev) return '';
  const d = now - prev;
  return d === 0 ? ' (same as the period before)' : ` (${d > 0 ? 'up' : 'down'} ${Math.abs(d)} on the period before)`;
}

function dateLabel(t: number, tz: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(t);
}

// --- Rendering (HTML email + plain text) ------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

interface Section {
  title: string;
  lines?: string[];
  table?: { head: string[]; rows: (string | number)[][] };
  empty?: string;
}

export function reportSections(r: Report, tz: string): Section[] {
  const out: Section[] = [];
  const period = r.days === 1 ? 'today' : r.days === 7 ? 'this week' : `in the last ${r.days} days`;
  const plat = Object.entries(r.devices.byPlatform)
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${PLATFORM_LABEL[p] ?? p} ${n}`)
    .join(', ');

  const lines = [
    `About ${plural(r.people.total, 'person', 'people')} used the app ${period}${delta(r.people.total, r.people.prev)}.`,
    `${r.players.length} signed in, ${plural(r.devices.anonymous, 'device')} without an account.`,
    `${plural(r.dailiesSolved, 'daily', 'dailies')} solved${delta(r.dailiesSolved, r.dailiesSolvedPrev)}.`,
  ];
  if (r.devices.total)
    lines.push(
      `${r.devices.total} devices opened the app — ${r.devices.installed} as a home-screen app, ${r.devices.browser} in a browser. ${plat}.`,
      `On an average day, ${r.devices.avgPerDay} devices opened it.`,
    );
  if (!r.trackingSince || r.trackingSince > r.from)
    lines.push(
      r.trackingSince
        ? `Note: detailed tracking started ${dateLabel(r.trackingSince, tz)}, so anything before then only counts finished dailies.`
        : 'Note: no app usage has been recorded yet — only finished dailies are counted.',
    );
  out.push({ title: 'Summary', lines });

  const dow = (d: string) => 'SMTWTFS'[new Date(`${d}T12:00:00Z`).getUTCDay()]!;
  const mark = (m?: 'daily' | 'played') => (m === 'daily' ? '●' : m === 'played' ? '◐' : '·');
  out.push({
    title: 'Who played when',
    lines: ['● finished a daily   ◐ opened the app or played something else   · nothing'],
    table: {
      head: ['', ...r.dayList.map(dow), 'Dailies', 'Last active'],
      rows: r.grid.map((g) => [
        g.kind === 'anon' ? `${g.name} (no account)` : g.kind === 'quiet' ? `${g.name} (gone quiet)` : g.name,
        ...r.dayList.map((d) => mark(g.marks[d])),
        g.dailies,
        g.lastActive ? ago(g.lastActive, Date.now(), tz) : '',
      ]),
    },
    empty: 'Nobody played.',
  });

  if (r.newUsers.length)
    out.push({
      title: 'New sign-ups',
      lines: r.newUsers.map((u) => `${u.name} — joined ${dateLabel(u.joined, tz)}, ${plural(u.dailies, 'daily', 'dailies')} so far`),
    });

  out.push({
    title: 'Games',
    table: {
      head: ['Kind', 'Level', 'Started', 'Picked back up', 'Finished'],
      rows: r.games.map((g) => [MODE_LABEL[g.mode] ?? g.mode, g.difficulty || '—', g.started, g.resumed, g.finished]),
    },
    empty: 'No games recorded yet.',
  });

  out.push({
    title: 'Features used',
    table: {
      head: ['Feature', 'Times', 'Devices'],
      rows: r.features.map((f) => [FEATURE_LABEL[f.name] ?? f.name, f.uses, f.devices]),
    },
    empty: 'None recorded yet.',
  });

  if (r.screens.length)
    out.push({
      title: 'Screens opened',
      table: {
        head: ['Screen', 'Times', 'Devices'],
        rows: r.screens.map((f) => [SCREEN_LABEL[f.name] ?? f.name, f.uses, f.devices]),
      },
    });

  if (r.settings.length)
    out.push({
      title: 'Settings changed',
      table: { head: ['Setting', 'Times', 'Devices'], rows: r.settings.map((f) => [f.name, f.uses, f.devices]) },
    });

  out.push({
    title: 'Feedback',
    lines: r.feedback.map((f) => `${dateLabel(f.at, tz)}, ${f.who}: ${f.message.replace(/\s+/g, ' ').slice(0, 300)}`),
    empty: 'None.',
  });
  return out;
}

// The grid's marks: centred, narrow, coloured like the stats page.
const DOT_BASE = 'padding:4px 3px;border-bottom:1px solid #e5e5e5;text-align:center;font-size:15px;';
const DOT_STYLE: Record<string, string> = {
  '●': `${DOT_BASE}color:#2f6fde;`,
  '◐': `${DOT_BASE}color:#8fb2ee;`,
  '·': `${DOT_BASE}color:#c9c9d1;`,
};

export function renderHtml(r: Report, tz: string): string {
  const td = 'padding:4px 10px;border-bottom:1px solid #e5e5e5;text-align:left;';
  const parts = reportSections(r, tz).map((s) => {
    let body = '';
    if (s.lines?.length) body += s.lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join('');
    if (s.table?.rows.length)
      body += `<table style="border-collapse:collapse;font-size:14px">
<tr>${s.table.head.map((h) => `<th style="${td}color:#666;font-weight:600">${esc(h)}</th>`).join('')}</tr>
${s.table.rows.map((row) => `<tr>${row.map((c) => `<td style="${DOT_STYLE[String(c)] ?? td}">${esc(String(c))}</td>`).join('')}</tr>`).join('\n')}
</table>`;
    if (!body && s.empty) body = `<p style="margin:4px 0;color:#666">${esc(s.empty)}</p>`;
    return `<h2 style="font-size:16px;margin:22px 0 6px">${esc(s.title)}</h2>${body}`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222;max-width:640px">
<h1 style="font-size:20px;margin:0 0 4px">Sudoku Crew: ${r.days === 1 ? 'today' : r.days === 7 ? 'the week' : `${r.days} days`} to ${esc(dateLabel(r.to - 1, tz))}</h1>
${parts.join('\n')}
<p style="margin-top:24px;color:#888;font-size:12px">Any time: <a href="https://sudokucrew.com/stats">sudokucrew.com/stats</a> (sign in to the web app in the same browser first).</p>
</div>`;
}

export function renderText(r: Report, tz: string): string {
  const parts = reportSections(r, tz).map((s) => {
    const lines = [s.title.toUpperCase()];
    if (s.lines?.length) lines.push(...s.lines);
    if (s.table?.rows.length) {
      lines.push(s.table.head.join(' | '));
      lines.push(...s.table.rows.map((row) => row.join(' | ')));
    }
    if (lines.length === 1 && s.empty) lines.push(s.empty);
    return lines.join('\n');
  });
  return parts.join('\n\n') + '\n\nAny time: https://sudokucrew.com/stats';
}

// --- Monday email -----------------------------------------------------------

export async function sendWeeklyReport(env: Env): Promise<void> {
  const to = env.REPORT_TO ?? env.FEEDBACK_TO;
  if (!to) return;
  const tz = env.DAILY_TIMEZONE;
  // Sent Monday morning: last Monday to yesterday (Sunday).
  const r = await buildReport(env, addDays(dateInTimezone(new Date(), tz), -1), 7);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: `Sudoku Crew this week: ${r.people.total} players, ${r.dailiesSolved} dailies${r.quiet.length ? `, ${r.quiet.length} gone quiet` : ''}`,
      html: renderHtml(r, tz),
      text: renderText(r, tz),
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

// --- Admin API --------------------------------------------------------------

export async function isAdmin(env: Env, userId: string): Promise<boolean> {
  return (env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

/** GET /v1/admin/report?days=7 — the report as sections, for the /stats page. */
export async function getAdminReport(req: Request, env: Env, days: number): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;
  if (!(await isAdmin(env, auth.user_id))) return jsonError(403, 'forbidden');
  const d = [1, 7, 30, 90].includes(days) ? days : 7;
  // Up to and including today (so "Today" is today so far).
  const r = await buildReport(env, dateInTimezone(new Date(), env.DAILY_TIMEZONE), d);
  return jsonOk({ report: r, labels: { mode: MODE_LABEL, feature: FEATURE_LABEL, screen: SCREEN_LABEL, platform: PLATFORM_LABEL }, tz: env.DAILY_TIMEZONE });
}
