# Releasing Sudoku Crew

## Before you start

Make sure all changes are committed and you're happy with the build on both platforms.

---

## Step 1 — Bump versions

| File | Field | Rule |
|---|---|---|
| `Android/app/build.gradle.kts` | `versionCode` | increment by 1 |
| `Android/app/build.gradle.kts` | `versionName` | semver (patch for fixes, minor for features) |
| `iOS/Sudoku.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION` | increment by 1 (both Debug + Release configs) |
| `iOS/Sudoku.xcodeproj/project.pbxproj` | `MARKETING_VERSION` | match Android `versionName` |

Or just ask Claude: *"bump versions for a patch/minor release"*.

---

## Step 2 — Write release notes

Add a new entry at the top of each file (latest first):

- `marketing/app-store-release-notes.md` — no hard limit but keep it short
- `marketing/play-store-release-notes.md` — **500 character limit** (note the char count)

Or just ask Claude: *"add release notes for [what changed]"*.

---

## Step 3 — Build

**iOS** *(manual — Xcode required)*
1. Open Xcode → select the `Sudoku` scheme → set destination to **Any iOS Device**
2. Product → Archive
3. Distribute App → App Store Connect → upload

**Android** *(Claude can do this)*
Ask: *"build the Android release"* — Claude runs `./gradlew bundleRelease` and tells you where the AAB landed.

---

## Step 4 — Submit

**iOS — App Store Connect**
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Sudoku Crew → App Store → + Version
2. Paste release notes from `marketing/app-store-release-notes.md`
3. Submit for review

**Android — Play Console**
1. [play.google.com/console](https://play.google.com/console) → Sudoku Crew → Production → Create new release
2. Upload the `.aab`
3. Paste release notes from `marketing/play-store-release-notes.md`
4. Roll out

---

## Version history

| Version | Build (iOS) | versionCode (Android) | Notes |
|---|---|---|---|
| 1.1.3 | 15 | 11 | Tutor: Unique Rectangle + relaxed strict-match guard |
| 1.1.2 | 14 | 10 | Highlight rules off = fully clean board |
| 1.1.1 | 13 | 9 | Invite deep links |
| 1.1.0 | 12 | — | Multiplayer |
| 1.0.6 | — | — | First public release |
