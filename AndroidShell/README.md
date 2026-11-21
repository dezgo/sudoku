# Android store app = shell around the web app

Since 2.0.0 (versionCode 12) the Play Store app `com.derekgillett.sudoku` is a
Trusted Web Activity: it opens https://sudokucrew.com/play full screen in
Chrome. Every web deploy reaches Android players with no store release. The old
native app is still in `../Android` (history only — don't release it again).

What the shell adds:
- First launch after updating from the native app hands the old saved sign-in
  to the web app (`/play/#signin=<token>`, handled by `handleAppHandoff` in
  `Web/src/app/App.tsx`), then deletes it, so nobody is signed out by the update.
  Tested 2026-11-21 on an emulator: native app signed in → shell installed over
  it → web app opened signed in, and stayed signed in after a restart.
- Old multiplayer links `sudoku.appfoundry.cc/m/CODE` → `/play/?join=CODE`.
- Links to sudokucrew.com `/play`, `/g/`, `/p/`, `/c/` open in the app.

Full screen (no address bar) needs the signing cert's SHA-256 in
`Backend/src/well-known.ts` — the Play App Signing cert is already listed, so
Play installs are full screen. A locally signed or debug build shows an address bar.

## Build (Ubuntu)
JDK 17 and the Android SDK live in `~/.local/opt` (set up 2026-11-21):

    export JAVA_HOME=$(ls -d ~/.local/opt/jdk-17*) ANDROID_HOME=~/.local/opt/android-sdk
    echo "sdk.dir=$ANDROID_HOME" > local.properties
    ./gradlew bundleRelease    # → app/build/outputs/bundle/release/app-release.aab

Signing: `keystore.properties` + the upload key (see keystore.properties.example).
Bump `versionCode` for every upload. Play requires targetSdk 36 for updates.
