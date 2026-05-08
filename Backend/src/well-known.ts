// Well-known files for Universal Links (iOS) and App Links (Android).
// Both platforms verify these on first install of the app and again
// periodically. They must be served:
//   - over HTTPS (which our Cloudflare custom domain handles)
//   - with content-type application/json
//   - WITHOUT a redirect (a 301/302 anywhere in the chain breaks verification)
//   - exactly at /.well-known/apple-app-site-association and /.well-known/assetlinks.json
//
// To re-verify on Android after the cert changes:
//   adb shell pm verify-app-links --re-verify com.derekgillett.sudoku
// To check iOS verification: install the app, then check that long-pressing
// a sudoku.appfoundry.cc/m/<code> link offers "Open in Sudoku Crew".

const TEAM_ID = '3WT5KZ4VQ8';
const IOS_BUNDLE_ID = 'com.derekgillett.Sudoku';
const ANDROID_PACKAGE = 'com.derekgillett.sudoku';

// SHA256 fingerprints from BOTH the local release keystore (covers
// sideloaded / Internal-track / Closed-track installs that ship with the
// upload key) AND Google's Play App Signing cert (covers production
// installs via the Play Store). Both must stay listed — Android picks
// whichever matches the installed APK's signature.
const ANDROID_CERT_FINGERPRINTS: string[] = [
  // Local release / upload keystore (Android/keystores/sudoku-release.jks).
  // Used by sideloaded builds and any install whose APK we signed locally
  // before Play re-signed it.
  '1F:75:FA:98:CD:7A:C6:63:57:7A:06:AC:90:1A:79:83:36:55:6E:41:F1:0C:09:60:5B:6C:B3:1A:1D:44:75:5C',
  // Google Play App Signing cert (Play Console → App integrity → App signing
  // → "App signing key certificate" SHA-256). Play re-signs every uploaded
  // bundle with this key before serving it to users, so production installs
  // verify against this fingerprint, not the upload key above.
  '18:5C:DE:B7:6A:C4:59:65:C6:A5:07:1E:8E:23:DD:89:25:E7:A2:F9:B2:E0:63:1B:66:6E:11:5D:C5:45:9C:C7',
];

export function getAppleAppSiteAssociation(): Response {
  const json = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${TEAM_ID}.${IOS_BUNDLE_ID}`,
          paths: ['/m/*'],
        },
      ],
    },
  };
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // No cache — Apple's CDN re-fetches periodically; we want our latest
      // wins quickly when the file changes.
      'cache-control': 'no-store',
    },
  });
}

export function getAndroidAssetLinks(): Response {
  const json = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: ANDROID_CERT_FINGERPRINTS,
      },
    },
  ];
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
