// Nudge to install. On iPhone this matters more than anywhere: Safari wipes
// an un-installed site's storage after ~7 days without a visit, and only
// home-screen web apps get notifications. Android/desktop Chrome get the
// native install prompt via beforeinstallprompt.

import { useEffect, useState } from 'preact/hooks';
import { readJSON, writeJSON } from '../lib/storage';
import { Icon } from './icons';
import { hasStoreApp, inStoreApp, isAndroid } from '../lib/shell';
import { track } from '../lib/usage';

const DISMISS_KEY = 'sudoku.install_hint_dismissed.v1';
// Set the first time the app runs installed (or the browser reports an
// install). On Android the installed app and Chrome tabs share storage, so
// this keeps the tip away from a browser tab on a phone that already has
// the app. (iPhone keeps home-screen apps' storage separate from Safari, so
// there a Safari tab can still show the tip — it's genuinely not the app.)
const INSTALLED_KEY = 'sudoku.installed.v1';
// Android players in the browser (or a home-screen web app) get offered the
// Google Play app instead. It's in early access (closed test), so joining
// takes two steps: the testers group, then the Play testing page.
const ANDROID_APP_DISMISS_KEY = 'sudoku.android_app_hint_dismissed.v1';
const TESTERS_GROUP_URL = 'https://groups.google.com/g/apptesters26';
const PLAY_TEST_URL = 'https://play.google.com/apps/testing/com.derekgillett.sudoku';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
window.addEventListener('appinstalled', () => writeJSON(INSTALLED_KEY, true));
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
});

function isStandalone(): boolean {
  return (
    inStoreApp() ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function InstallHint() {
  const [androidDismissed, setAndroidDismissed] = useState(() => readJSON<boolean>(ANDROID_APP_DISMISS_KEY, false));
  if (isAndroid() && !inStoreApp() && !hasStoreApp() && !androidDismissed) {
    return (
      <AndroidAppHint
        onDismiss={() => {
          writeJSON(ANDROID_APP_DISMISS_KEY, true);
          setAndroidDismissed(true);
        }}
      />
    );
  }
  return <WebInstallHint />;
}

function AndroidAppHint({ onDismiss }: { onDismiss: () => void }) {
  const open = (step: string) => () => track('feature', { f: 'android_app_' + step });
  return (
    <div class="install-hint">
      <Icon name="download" size={20} />
      <div style={{ flex: 1 }}>
        <b>Sudoku Crew is on Google Play</b> — in early access. Two quick steps, and your account comes with you:
        <ol class="install-steps">
          <li>
            <a href={TESTERS_GROUP_URL} target="_blank" rel="noopener" onClick={open('group')}>
              Join the testers group
            </a>{' '}
            (tap Join)
          </li>
          <li>
            <a href={PLAY_TEST_URL} target="_blank" rel="noopener" onClick={open('play')}>
              Get it on Google Play
            </a>{' '}
            (tap Become a tester, then install)
          </li>
        </ol>
      </div>
      <button class="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

function WebInstallHint() {
  const [dismissed, setDismissed] = useState(() => readJSON<boolean>(DISMISS_KEY, false));
  const [, setTick] = useState(0);
  useEffect(() => {
    // beforeinstallprompt can land after first render.
    const t = setTimeout(() => setTick((n) => n + 1), 1500);
    return () => clearTimeout(t);
  }, []);

  if (isStandalone()) {
    writeJSON(INSTALLED_KEY, true);
    return null;
  }
  if (dismissed || readJSON<boolean>(INSTALLED_KEY, false)) return null;
  const dismiss = () => {
    writeJSON(DISMISS_KEY, true);
    setDismissed(true);
  };

  if (isIOS()) {
    return (
      <div class="install-hint">
        <Icon name="share" size={20} />
        <div style={{ flex: 1 }}>
          <b>Add to your Home Screen</b> so your games are kept safe and it opens like an app: tap Share, then “Add to Home
          Screen”.
        </div>
        <button class="icon-btn" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  }
  if (deferred) {
    return (
      <div class="install-hint">
        <Icon name="download" size={20} />
        <div style={{ flex: 1 }}>Install Sudoku Crew so it opens like an app.</div>
        <button
          class="btn compact primary"
          onClick={async () => {
            await deferred?.prompt();
            deferred = null;
            dismiss();
          }}
        >
          Install
        </button>
      </div>
    );
  }
  if (/Android/i.test(navigator.userAgent)) {
    // Samsung Internet, Firefox etc. never fire beforeinstallprompt, so
    // there's no button to offer — just say where the menu option lives.
    return (
      <div class="install-hint">
        <Icon name="download" size={20} />
        <div style={{ flex: 1 }}>
          <b>Add to your Home screen</b> so it opens like an app: open your browser's menu, then “Add to Home screen”
          (or “Install app”).
        </div>
        <button class="icon-btn" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  }
  return null;
}
