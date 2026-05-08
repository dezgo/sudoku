# Play Console — App access (reviewer credentials)

The Sudoku Crew app requires email-OTP sign-in to use the daily-leaderboard
features (groups, scores). The backend has a reviewer bypass so Google
reviewers can sign in without needing access to a real inbox.

## Test credentials

```
Email:        playstore-reviewer@appfoundry.cc
OTP code:     314159
```

(Substitute whatever email + code you set as `REVIEWER_EMAIL` and
`REVIEWER_OTP_CODE` Worker secrets — see the deploy steps below.)

## What to paste into the App access form

In Play Console → App content → App access:

- Select **"All or some functionality is restricted"**
- Click **Add new instructions**
- **Name:** Sign-in (email-OTP)
- **Username/email:** `playstore-reviewer@appfoundry.cc`
- **Password:** `314159` (this is the OTP code, not a password)
- **Any other information:**

```
This app uses email-OTP sign-in (no passwords). To skip the email
round-trip, enter the email above and the verification code 314159 when
prompted. The reviewer account has the same access as a normal user.

To verify the leaderboard / friend-groups feature, the reviewer account
is pre-joined to a small test group with sample scores already posted.
```

## Setting the bypass on the Worker

The bypass only activates if both Worker secrets are set:

```bash
cd Backend
echo 'playstore-reviewer@appfoundry.cc' | npx wrangler secret put REVIEWER_EMAIL
echo '314159' | npx wrangler secret put REVIEWER_OTP_CODE
```

Verify it's live:

```bash
curl -s -X POST https://sudoku.appfoundry.cc/v1/auth/start \
  -H 'content-type: application/json' \
  -d '{"email":"playstore-reviewer@appfoundry.cc"}' -i | head -1
# expect: HTTP/2 204

curl -s -X POST https://sudoku.appfoundry.cc/v1/auth/verify \
  -H 'content-type: application/json' \
  -d '{"email":"playstore-reviewer@appfoundry.cc","code":"314159"}' | jq
# expect: { "token": "...", "user": {...}, "needs_display_name": true }
```

## Pre-seeding the reviewer group (optional but nice)

To make the leaderboard feature actually showcase something for the
reviewer, sign in with the reviewer email yourself, create a group called
e.g. "Reviewer Demo", solve a daily puzzle so a score appears, then sign
out. Now whoever signs in as the reviewer has a populated group.

## Removing the bypass later (post-review)

If you want to revoke reviewer access after launch:

```bash
npx wrangler secret delete REVIEWER_EMAIL
npx wrangler secret delete REVIEWER_OTP_CODE
```

The reviewer account itself remains in D1 — you can also delete it via a
direct query if you want a clean slate.
