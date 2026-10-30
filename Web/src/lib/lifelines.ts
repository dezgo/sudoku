// Lifelines: the four assists a solve can lean on, shown like used lifelines
// on a quiz show — lit until used, crossed out once used. Read from the
// counters and "ever on" flags the game already keeps for the leaderboard.

import type { Game } from '../engine/game';

export type Lifeline = 'pencil' | 'hint' | 'highlight' | 'mistakes';

export const LIFELINES: { key: Lifeline; label: string; icon: string; about: string }[] = [
  { key: 'pencil', label: 'Auto-pencil', icon: 'wand', about: 'The wand filled in pencil marks for you.' },
  { key: 'hint', label: 'Hint', icon: 'bulb', about: 'The tutor showed a step.' },
  {
    key: 'highlight',
    label: 'Highlighting',
    icon: 'grid',
    about: 'Rule highlighting was on: it shades squares a number can’t go in (Settings › Highlight rules).',
  },
  {
    key: 'mistakes',
    label: 'Show mistakes',
    icon: 'alert',
    about: 'Wrong numbers turned red straight away (Settings › Highlight mistakes). Always on in co-op.',
  },
];

export function lifelinesUsed(g: Game): Lifeline[] {
  const used: Lifeline[] = [];
  if (g.pencilAssistsUsed > 0) used.push('pencil');
  if (g.hintsUsed > 0) used.push('hint');
  if (g.highlightConstraintsEverOn) used.push('highlight');
  if (g.highlightMistakesEverOn) used.push('mistakes');
  return used;
}
