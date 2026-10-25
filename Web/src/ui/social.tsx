// Account + groups + leaderboard sheets (SPEC §13.6, §17).

import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { ApiError, api, type GroupListItem, type GroupMember, type LeaderboardEntry } from '../lib/api';
import { dateFromDailyId, displayLabel, formatTime, shortDate } from '../lib/format';
import type { Appearance } from '../lib/storage';
import { Icon } from './icons';
import { Segmented, Sheet, shareText, Toggle } from './Sheet';

function errorCopy(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    // Distinct copy for "can't reach the server" — during the Aug 2026
    // outage a generic message made a dead backend look like a bug.
    if (e.kind === 'offline') return "Can't reach the server. Check your connection or try again shortly.";
    if (e.status === 429) return 'Too many tries. Wait a minute and try again.';
  }
  return fallback;
}

// ---------- Sign in ----------

export function SignInSheet({ then }: { then?: () => void }) {
  const s = useStore();
  const [step, setStep] = useState<'email' | 'code' | 'name' | 'groups'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (step !== 'code') return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  // A ref, not just the `busy` state: state only updates on the next render,
  // so a fast double-tap (or keyboard Go + a tap) could start two sends.
  // Each send replaces the previous code, so the first email's code then
  // fails with "didn't match" — the likeliest cause of a failed first
  // sign-in on 25 Oct 2026, where the emailed code wasn't the stored one.
  const inFlight = useRef(false);
  const run = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      try {
        await s.startSignIn(email);
        setStep('code');
        setResendAt(Date.now() + 30_000);
      } catch (e) {
        setError(
          e instanceof ApiError && e.detail === 'invalid_email'
            ? "That doesn't look like a valid email."
            : errorCopy(e, "Couldn't send the code. Try again."),
        );
      }
    });

  const finish = async () => {
    await s.refreshGroups();
    if (s.groups.length === 0) setStep('groups');
    else {
      s.close();
      then?.();
    }
  };

  const verify = () =>
    run(async () => {
      try {
        const needsName = await s.verifySignIn(email, code);
        if (needsName) setStep('name');
        else await finish();
      } catch (e) {
        const d = e instanceof ApiError ? e.detail : undefined;
        setError(
          d === 'wrong_code'
            ? "That code didn't match."
            : d === 'code_expired' || d === 'no_pending_code'
              ? 'Code expired — request a new one.'
              : d === 'too_many_attempts'
                ? 'Too many tries. Request a new code.'
                : errorCopy(e, "Couldn't verify the code. Try again."),
        );
      }
    });

  const saveName = () =>
    run(async () => {
      try {
        await s.setDisplayName(name);
        await finish();
      } catch (e) {
        setError(errorCopy(e, "Couldn't save your name. Try again."));
      }
    });

  if (step === 'groups') return <GroupOnboardingSheet mode="choose" onboarding />;

  const title = step === 'email' ? 'Sign in' : step === 'code' ? 'Enter code' : 'Choose a name';
  const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));

  return (
    <Sheet
      title={title}
      left={<button class="link" onClick={() => s.close()}>Cancel</button>}
      right={<span />}
      dismissable={!busy}
    >
      <form
        class="stack"
        style={{ paddingTop: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          if (step === 'email' && email.trim()) void sendCode();
          else if (step === 'code' && code.trim().length === 6) void verify();
          else if (step === 'name' && name.trim()) void saveName();
        }}
      >
        {step === 'email' && (
          <>
            <p class="muted" style={{ margin: 0 }}>
              We'll email you a 6-digit code. Already play on the app? Use the same email and your history comes with
              you.
            </p>
            <input
              class="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              placeholder="you@example.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
              autoFocus
            />
          </>
        )}
        {step === 'code' && (
          <>
            <p class="muted" style={{ margin: 0 }}>
              Code sent to {email}. It can take a minute — check spam if it's not there.
            </p>
            <input
              class="field code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
              autoFocus
            />
          </>
        )}
        {step === 'name' && (
          <>
            <p class="muted" style={{ margin: 0 }}>
              This is what shows up on the leaderboard.
            </p>
            <input
              class="field"
              placeholder="Display name"
              maxLength={40}
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              autoFocus
            />
          </>
        )}
        {error && <div class="error">{error}</div>}
        <button
          class="btn primary"
          type="submit"
          disabled={
            busy ||
            (step === 'email' && !email.trim()) ||
            (step === 'code' && code.length !== 6) ||
            (step === 'name' && !name.trim())
          }
        >
          {busy ? '…' : step === 'email' ? 'Send code' : step === 'code' ? 'Verify' : 'Continue'}
        </button>
        {step === 'code' && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              class="link"
              onClick={() => {
                setCode('');
                setError(null);
                setStep('email');
              }}
            >
              Use a different email
            </button>
            <button type="button" class="link" disabled={wait > 0 || busy} onClick={() => void sendCode()}>
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

// ---------- Group onboarding (create / join) ----------

export function GroupOnboardingSheet({ mode: initial, onboarding = false }: { mode: 'choose' | 'create' | 'join'; onboarding?: boolean }) {
  const s = useStore();
  const [mode, setMode] = useState(initial);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; code: string } | null>(null);

  const submit = async () => {
    if (!s.token) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const r = await api.createGroup(s.token, value.trim());
        await s.refreshGroups();
        setCreated({ name: r.group.name, code: r.invite_code });
      } else {
        await api.joinGroup(s.token, value.trim().toUpperCase());
        await s.refreshGroups();
        s.close();
        s.showToast('Joined!');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError("We don't recognise that code.");
      else setError(errorCopy(e, mode === 'create' ? "Couldn't create the group. Try again." : "Couldn't join. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Groups"
      left={
        mode !== 'choose' && !created && initial === 'choose' ? (
          <button class="link" onClick={() => setMode('choose')}>
            Back
          </button>
        ) : undefined
      }
      right={
        <button class="link" onClick={() => s.close()}>
          {created ? 'Done' : onboarding ? 'Skip for now' : 'Cancel'}
        </button>
      }
    >
      <div class="stack" style={{ paddingTop: 6 }}>
        {created ? (
          <>
            <div class="center" style={{ color: 'var(--success)' }}>
              <Icon name="seal" size={48} />
            </div>
            <p class="center" style={{ margin: 0 }}>
              <b>{created.name}</b> created. Share this code with the people you want in:
            </p>
            <div class="field code">{created.code}</div>
            <button class="btn primary" onClick={() => void shareText(`Join my Sudoku Crew group with code: ${created.code}`, location.origin + '/play/')}>
              <Icon name="share" size={18} /> Share invite
            </button>
          </>
        ) : mode === 'choose' ? (
          <>
            <p class="muted" style={{ margin: 0 }}>
              Groups are how you compare times with your friends and family. The same daily, separate leaderboards.
            </p>
            <button class="btn primary" onClick={() => setMode('create')}>
              <Icon name="plus" size={18} /> Create a group
            </button>
            <button class="btn" onClick={() => setMode('join')}>
              <Icon name="users" size={18} /> Join with a code
            </button>
          </>
        ) : (
          <form
            class="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim() && !busy) void submit();
            }}
          >
            <p class="muted" style={{ margin: 0 }}>
              {mode === 'create'
                ? 'Pick a name for your group. You can share the join code with friends after.'
                : 'Type the 6-character code your friend sent you.'}
            </p>
            <input
              class={`field${mode === 'join' ? ' code' : ''}`}
              placeholder={mode === 'create' ? 'Group name' : 'ABC234'}
              maxLength={mode === 'create' ? 40 : 6}
              autoCapitalize={mode === 'join' ? 'characters' : 'sentences'}
              value={value}
              onInput={(e) => setValue(e.currentTarget.value)}
              autoFocus
            />
            {error && <div class="error">{error}</div>}
            <button class="btn primary" type="submit" disabled={busy || !value.trim()}>
              {busy ? '…' : mode === 'create' ? 'Create' : 'Join'}
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
}

// ---------- Settings ----------

export function SettingsSheet() {
  const s = useStore();
  const p = s.prefs;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState<GroupListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <Sheet title="Settings">
      <div class="section-title">Account</div>
      <div class="group">
        {s.identity ? (
          <>
            <div class="row">
              <Icon name="person" size={20} />
              <span class="grow">{s.identity.user.display_name ?? 'No display name'}</span>
            </div>
            <button class="row" onClick={() => s.signOut()}>
              <span class="grow" style={{ color: 'var(--accent)' }}>
                Sign out
              </span>
            </button>
          </>
        ) : (
          <button class="row" onClick={() => s.open({ kind: 'signIn' })}>
            <Icon name="person" size={20} />
            <span class="grow" style={{ color: 'var(--accent)' }}>
              Sign in
            </span>
          </button>
        )}
      </div>

      {s.identity && (
        <>
          <div class="section-title">Groups</div>
          <div class="group">
            {s.groups.map((g) => (
              <div class="row" key={g.group.id}>
                <button class="grow" style={{ textAlign: 'left' }} onClick={() => s.open({ kind: 'groupMembers', group: g })}>
                  <div>{g.group.name}</div>
                  <div class="sub">
                    {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                    {g.invite_code ? ` · Code ${g.invite_code}` : ''}
                  </div>
                </button>
                {g.invite_code && (
                  <button
                    class="icon-btn"
                    aria-label={`Share ${g.group.name} invite`}
                    onClick={() => void shareText(`Join my Sudoku Crew group with code: ${g.invite_code}`, location.origin + '/play/')}
                  >
                    <Icon name="share" size={18} />
                  </button>
                )}
                <button class="link" style={{ color: 'var(--error)' }} onClick={() => setLeaving(g)}>
                  Leave
                </button>
              </div>
            ))}
            <button class="row" onClick={() => s.open({ kind: 'groupOnboarding', mode: 'create' })}>
              <Icon name="plus" size={18} />
              <span class="grow" style={{ color: 'var(--accent)' }}>
                Create a group
              </span>
            </button>
            <button class="row" onClick={() => s.open({ kind: 'groupOnboarding', mode: 'join' })}>
              <Icon name="users" size={18} />
              <span class="grow" style={{ color: 'var(--accent)' }}>
                Join with a code
              </span>
            </button>
          </div>
          {leaving && (
            <div class="group" style={{ padding: 14, marginTop: 10 }}>
              <b>Leave {leaving.group.name}?</b>
              <p class="muted small">You'll stop seeing the leaderboard for {leaving.group.name}.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button class="btn compact" style={{ flex: 1 }} onClick={() => setLeaving(null)}>
                  Cancel
                </button>
                <button
                  class="btn compact danger"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    try {
                      await api.leaveGroup(s.token!, leaving.group.id);
                      await s.refreshGroups();
                    } catch (e) {
                      s.showToast(errorCopy(e, "Couldn't leave the group."));
                    }
                    setLeaving(null);
                  }}
                >
                  Leave
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div class="section-title">Highlighting</div>
      <div class="group">
        <Toggle label="Highlight mistakes" checked={p.highlightMistakes} onChange={(v) => s.setPref('highlightMistakes', v)} />
        <Toggle label="Highlight rules" checked={p.highlightConstraints} onChange={(v) => s.setPref('highlightConstraints', v)} />
      </div>

      <div class="section-title">Sounds</div>
      <div class="group">
        <Toggle label="Sound effects" checked={p.sound} onChange={(v) => s.setPref('sound', v)} />
      </div>

      <div class="section-title">Appearance</div>
      <Segmented<Appearance>
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={p.appearance}
        onChange={(v) => s.setPref('appearance', v)}
      />

      {s.identity && (
        <>
          <div class="section-title">Danger zone</div>
          <div class="group">
            {!confirmDelete ? (
              <button class="row" onClick={() => setConfirmDelete(true)}>
                <span class="grow" style={{ color: 'var(--error)' }}>
                  Delete account
                </span>
              </button>
            ) : (
              <div style={{ padding: 14 }}>
                <b>Delete your account?</b>
                <p class="muted small">
                  This permanently erases your account, daily history, group memberships, and any games you've played.
                  This can't be undone.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button class="btn compact" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                  <button
                    class="btn compact danger"
                    style={{ flex: 1 }}
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await s.deleteAccount();
                        setConfirmDelete(false);
                      } catch (e) {
                        s.showToast(errorCopy(e, "Couldn't delete your account. Please try again."));
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <p class="footnote center" style={{ marginTop: 24 }}>
        <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'inherit' }}>
          Privacy policy
        </a>
      </p>
    </Sheet>
  );
}

// ---------- Group members ----------

export function GroupMembersSheet({ group }: { group: GroupListItem }) {
  const s = useStore();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .groupMembers(s.token!, group.group.id)
      .then(setMembers)
      .catch((e) => setError(errorCopy(e, "Couldn't load members.")));
  }, [group.group.id]);
  return (
    <Sheet title={group.group.name}>
      {error && <p class="empty">{error}</p>}
      {!members && !error && <div class="spinner" />}
      {members && (
        <div class="group">
          {members.map((m) => (
            <div class="row" key={m.user.id}>
              <div class="grow">
                <div>
                  {m.user.display_name ?? 'Unnamed'}
                  {m.user.id === s.identity?.user.id && <span class="muted"> (you)</span>}
                </div>
                <div class="sub">
                  {m.dailies_completed
                    ? `${m.dailies_completed} ${m.dailies_completed === 1 ? 'daily' : 'dailies'}${m.last_completed_at ? ` · last ${shortDate(new Date(m.last_completed_at))}` : ''}`
                    : 'no dailies yet'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------- Leaderboard ----------

const TOP_N = 10;

function Badges({ e }: { e: LeaderboardEntry }) {
  const solo = e.hints_used === 0;
  const manual = e.pencil_assists_used === 0;
  // Purist = no tutor, no auto-pencil, no mistakes. Highlight toggles are
  // learning aids, deliberately not gating it (matches the apps).
  if (solo && manual && e.flawless)
    return (
      <span class="badges b-purist" title="Purist — no hints, no auto-pencil, no mistakes">
        <Icon name="star" size={15} filled />
      </span>
    );
  return (
    <span class="badges">
      {solo && (
        <span class="b-solo" title="Solo — solved without using the tutor">
          <Icon name="slashBulb" size={15} />
        </span>
      )}
      {manual && (
        <span class="b-manual" title="Manual — solved without auto-pencil">
          <Icon name="pencil" size={15} />
        </span>
      )}
      {e.flawless && (
        <span class="b-flawless" title="Flawless — solved without any mistakes">
          <Icon name="check" size={15} />
        </span>
      )}
    </span>
  );
}

export function LeaderboardSheet({ puzzleId }: { puzzleId: number }) {
  const s = useStore();
  const [groupId, setGroupId] = useState<string | null>(s.groups[0]?.group.id ?? null);
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const label = displayLabel({ id: puzzleId, difficulty: 'medium' });

  const load = () => {
    if (!s.token || !groupId) return;
    setRows(null);
    setError(null);
    api
      .groupScores(s.token, groupId, puzzleId)
      .then(setRows)
      .catch((e) => setError(errorCopy(e, "Couldn't load leaderboard.")));
  };
  useEffect(load, [groupId, puzzleId, s.token]);

  const myName = s.identity?.user.display_name;
  const isMe = (e: LeaderboardEntry) => !!myName && e.display_name === myName;
  const mine = rows?.find(isMe);
  const myMistakes = s.resultFor(puzzleId)?.mistakes;

  const body = () => {
    if (!s.identity)
      return (
        <div class="empty">
          <p>
            <b>Sign in to see leaderboards.</b>
          </p>
          <p>You'll be able to compare your time with friends in your groups.</p>
          <button class="btn primary" onClick={() => s.open({ kind: 'signIn' })}>
            Sign in
          </button>
        </div>
      );
    if (!s.groups.length)
      return (
        <div class="empty">
          <p>
            <b>Join a group to see leaderboards.</b>
          </p>
          <p>Create one and share the invite code, or join with a code from a friend.</p>
          <button class="btn primary" onClick={() => s.open({ kind: 'groupOnboarding', mode: 'choose' })}>
            Set up a group
          </button>
        </div>
      );
    if (error)
      return (
        <div class="empty">
          <p>{error}</p>
          <button class="btn compact" onClick={load}>
            Try again
          </button>
        </div>
      );
    if (!rows) return <div class="spinner" />;
    if (!rows.length)
      return (
        <div class="empty">
          <p>
            <b>No one's solved this daily yet.</b>
          </p>
          <p>Be the first.</p>
        </div>
      );
    const top = rows.slice(0, TOP_N);
    const showMine = mine && !top.includes(mine);
    const renderRow = (e: LeaderboardEntry) => {
      const eff = e.effective_seconds ?? e.elapsed_seconds;
      const expanded = open === e.rank;
      return (
        <div key={e.rank}>
          <button class={`row lb-row${isMe(e) ? ' me' : ''}`} onClick={() => setOpen(expanded ? null : e.rank)}>
            <span class="lb-rank">{e.rank}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.display_name ?? 'Unnamed'}
              <Badges e={e} />
            </span>
            <span class="lb-time">{formatTime(eff)}</span>
          </button>
          {expanded && (
            <div class="row" style={{ display: 'block', fontSize: '0.88rem' }}>
              <div class="muted">
                Raw {formatTime(e.elapsed_seconds)} · Effective {formatTime(eff)}
                {eff > e.elapsed_seconds ? ' (includes mistake penalty)' : ' · no mistake penalty'}
              </div>
              {isMe(e) && myMistakes !== undefined && <div class="muted">Your mistakes: {myMistakes}</div>}
              <div class="muted">Solved {new Date(e.completed_at).toLocaleString()}</div>
            </div>
          )}
        </div>
      );
    };
    return (
      <>
        <div class="group">{top.map(renderRow)}</div>
        {showMine && (
          <>
            <div class="section-title">Your rank</div>
            <div class="group">{renderRow(mine)}</div>
          </>
        )}
      </>
    );
  };

  return (
    <Sheet
      title={`Leaderboard · ${label.replace('Daily · ', '')}`}
      left={
        <button class="icon-btn" aria-label="Badge legend" onClick={() => setLegend(!legend)}>
          <Icon name="info" size={20} />
        </button>
      }
    >
      {legend && (
        <div class="coach-intro small">
          <p style={{ marginTop: 0 }}>
            <span class="b-solo">
              <Icon name="slashBulb" size={14} />
            </span>{' '}
            <b>Solo</b> — solved without asking the tutor for hints.
            <br />
            <span class="b-manual">
              <Icon name="pencil" size={14} />
            </span>{' '}
            <b>Manual</b> — no auto-pencil; you did your candidate-marking by hand.
            <br />
            <span class="b-flawless">
              <Icon name="check" size={14} />
            </span>{' '}
            <b>Flawless</b> — zero incorrect placements.
            <br />
            <span class="b-purist">
              <Icon name="star" size={14} filled />
            </span>{' '}
            <b>Purist</b> — all three on the same solve.
          </p>
          <p class="muted" style={{ marginBottom: 0 }}>
            Mistakes add a small time penalty (about 10% each, capped at five) when ranking. You'll never see anyone's
            count, just the resulting position.
          </p>
        </div>
      )}
      {s.groups.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Segmented
            options={s.groups.map((g) => ({ value: g.group.id, label: g.group.name }))}
            value={groupId ?? ''}
            onChange={setGroupId}
          />
        </div>
      )}
      {body()}
      <p class="footnote center">{shortDate(dateFromDailyId(puzzleId))} daily</p>
    </Sheet>
  );
}
