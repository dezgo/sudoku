# Sudoku Crew

A daily Sudoku puzzle and private leaderboard for friend groups.

**Play it: [sudokucrew.com/play](https://sudokucrew.com/play)** — a progressive web app; add it to your home screen.

`main` is what's live in production.

| Folder | What it is |
|---|---|
| [`Web/`](Web/) | **The live app.** PWA built with Vite + Preact + TypeScript. |
| [`Backend/`](Backend/) | Cloudflare Worker (TypeScript + D1 + Resend): the API, the daily puzzle, and hosting for the web app at `/play`. |
| [`iOS/`](iOS/), [`Android/`](Android/) | The original App Store / Play Store apps. Being retired in favour of the web app; kept working until then. |

## Deploying

```bash
cd Backend
npm run deploy   # builds Web/ into Backend/public/play, then wrangler deploy
```

Run the web app's tests with `npm test` in `Web/`.

More detail: [`STATUS.md`](STATUS.md) (where things stand) and [`SPEC.md`](SPEC.md) (behaviour, data model, API).
