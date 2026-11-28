// Is the web app running inside the store app (iPhone shell or Android TWA)?
// The iPhone shell adds "SudokuCrewApp/ios" to the user agent; the Android
// TWA's first page load has an android-app:// referrer, remembered after that.

const KEY = 'sudoku.in_store_app.v1';

// Remembered for good once the store app has run. On Android the Play app
// (a Trusted Web Activity) shares Chrome's storage, so a Chrome tab on the
// same phone can tell the app is already installed.
const HAS_APP_KEY = 'sudoku.has_store_app.v1';

export function inStoreApp(): boolean {
  if (/SudokuCrewApp\//.test(navigator.userAgent)) return markHasApp();
  try {
    if (document.referrer.startsWith('android-app://com.derekgillett.sudoku')) {
      sessionStorage.setItem(KEY, '1');
      return markHasApp();
    }
    return sessionStorage.getItem(KEY) === '1' && markHasApp();
  } catch {
    return false;
  }
}

function markHasApp(): true {
  try {
    localStorage.setItem(HAS_APP_KEY, '1');
  } catch {
    /* private mode */
  }
  return true;
}

/** Has the store app ever run on this device (in this browser's storage)? */
export function hasStoreApp(): boolean {
  try {
    return localStorage.getItem(HAS_APP_KEY) === '1';
  } catch {
    return false;
  }
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}
