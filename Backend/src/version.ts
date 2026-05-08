// In-app update prompt: clients GET /v1/version on launch and compare to
// their own bundle version. If `current` > bundle → soft prompt ("Update
// available"). If `min_required` > bundle → hard block ("Please update to
// continue") for backend-breaking changes.
//
// Values come from `wrangler.toml` [vars] — bump per release, no code
// change needed. Defaults below are fallbacks if a var is missing.

import type { Env } from './types';
import { jsonOk } from './http';

const FALLBACK_CURRENT = '1.0';
const FALLBACK_MIN = '1.0';

export function getVersion(env: Env): Response {
  return jsonOk({
    ios: {
      current: env.IOS_CURRENT_VERSION ?? FALLBACK_CURRENT,
      min_required: env.IOS_MIN_REQUIRED_VERSION ?? FALLBACK_MIN,
      store_url: 'https://apps.apple.com/app/sudoku-crew/id6757345095',
    },
    android: {
      current: env.ANDROID_CURRENT_VERSION ?? FALLBACK_CURRENT,
      min_required: env.ANDROID_MIN_REQUIRED_VERSION ?? FALLBACK_MIN,
      store_url: 'https://play.google.com/store/apps/details?id=com.derekgillett.sudoku',
    },
  });
}
