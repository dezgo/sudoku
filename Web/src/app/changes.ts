// What's new — plain-English, newest first. Shown in the app ("What's new"
// on Home and in Settings). Add an entry with every deploy players would
// notice; skip behind-the-scenes work (stats, tooling, docs).

export interface Change {
  /** 'YYYY-MM-DD' */
  date: string;
  items: string[];
}

export const CHANGES: Change[] = [
  {
    date: '2026-11-19',
    items: ['“Invite a friend” now shows a QR code. A friend points their phone camera at it to open Sudoku Crew and connect with you. You can still send a link instead.'],
  },
  {
    date: '2026-11-18',
    items: [
      'Opening a friend’s invite link shows what you’d both see before anything is sent. “How your crew works” now lists exactly what you share, and what you never share.',
      'Introductions you’ve made show “Introduced ✓” on both people’s pages.',
      'Introduce two people in your crew. They each get asked, and connect only if both say yes. You never find out whether they already knew each other.',
      'Your whole crew now shows on the home screen as a row of faces. Tap one to see their week, what they’ve played, add a private note or remove them.',
      'Swipe someone left in your crew list for Note and Remove (or tap them on a computer).',
      'Private notes on people — “Sam from work” — that only you see. They save as you type.',
      'Crew requests now say “wants to connect”, and make clear they don’t see your crew.',
      'Crews are now your own list of friends. Opening your invite link sends you a request; nobody’s added unless you accept.',
      'Watch someone in your crew play, live — only if they say yes.',
      '“Playing right now” and how many solved today’s daily, plus the puzzles everyone loved this week.',
      'Rate a puzzle after you solve it (😐 🙂 😍) and say if you learnt something — your crew sees that, never your time.',
      'Your crew’s recent games and favourites, with “Try it” to play the same board.',
      'A tidier home screen: leaderboard, history and games moved off it.',
    ],
  },
  {
    date: '2026-11-15',
    items: ['Coach: each lesson now explains the technique, shows a worked example, then lets you try it.'],
  },
  {
    date: '2026-11-14',
    items: ['Sound works on iPhone again.', 'Hints are in plain English and point at lettered cells.', 'Coach uses real puzzle boards.'],
  },
  {
    date: '2026-11-11',
    items: ['Pencil and Speed mode switch each other off, so you can’t get stuck in both.'],
  },
  {
    date: '2026-11-05',
    items: ['You can now erase a correct number you put in.', 'Shared puzzles go out as a plain link.'],
  },
  {
    date: '2026-11-04',
    items: ['Suggest a change or report a problem from inside the app.'],
  },
  {
    date: '2026-10-30',
    items: [
      'Co-op: solve one board together with a friend, live.',
      'Share a puzzle under a three-word name so friends can play the same board.',
      'Lifelines: see which helpers a solve used.',
      'New Expert difficulty.',
      'Signing in: easier to get back to “Enter code” after checking your email.',
    ],
  },
  {
    date: '2026-10-26',
    items: ['Choose your own colours in Settings.', 'Leaderboard: look back at any day, plus week, month and all-time standings.'],
  },
  {
    date: '2026-10-25',
    items: [
      'Sudoku Crew moves to the web at sudokucrew.com/play — add it to your home screen and it works like an app.',
      'Daily history calendar: catch up on days you missed, with streaks.',
      'A “new version ready” banner with an Update button.',
      'Clearer board, softer highlights and gentler sounds.',
    ],
  },
];
