// Is the web app running inside the store app (iPhone shell or Android TWA)?
// The iPhone shell adds "SudokuCrewApp/ios" to the user agent; the Android
// TWA's first page load has an android-app:// referrer, remembered after that.

const KEY = 'sudoku.in_store_app.v1';

export function inStoreApp(): boolean {
  if (/SudokuCrewApp\//.test(navigator.userAgent)) return true;
  try {
    if (document.referrer.startsWith('android-app://com.derekgillett.sudoku')) {
      sessionStorage.setItem(KEY, '1');
      return true;
    }
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
