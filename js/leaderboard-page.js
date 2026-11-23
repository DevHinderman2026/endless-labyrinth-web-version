// The Weekly Leaderboard page (web 7.2.0): this week's best Chaos Mode scores, this
// device's own, and last week's signed winner (js/leaderboard.js).

import * as lb from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const TOP = 10;
const pts = (n) => `${n} ${n === 1 ? 'point' : 'points'}`;

async function show() {
  const week = lb.weekOf();
  const me = lb.deviceId();
  $('lb-week').textContent = `The week from ${lb.weekWords(week)}, Eastern time.`;
  let rows = null;
  try { rows = await lb.board(week); } catch (e) { rows = null; }
  const top = $('lb-top');
  top.textContent = '';
  if (rows === null) {
    $('lb-note').textContent = 'The scores could not be loaded. Check your connection, and open this page again.';
  } else {
    $('lb-note').textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'player has' : 'players have'} a Chaos Mode score this week.` : 'No Chaos Mode scores yet this week.';
    rows.slice(0, TOP).forEach((row) => {
      const li = document.createElement('li');
      li.textContent = pts(row.best) + (row.id === me ? ' (you, in this browser)' : '');
      top.appendChild(li);
    });
    const mine = rows.findIndex((row) => row.id === me);
    $('lb-mine').textContent = mine >= 0
      ? `Your best this week, in this browser: ${pts(rows[mine].best)}, place ${mine + 1} of ${rows.length}.`
      : 'This browser has no Chaos Mode score this week. On an iPhone or iPad, the game on your Home Screen is a copy of its own: open this page from inside it to find its scores.';
  }
  let r = null;
  try { r = await lb.loadResult(); } catch (e) { r = null; }
  $('lb-winner').textContent = r
    ? `The week from ${lb.weekWords(r.week)}: the winning score was ${pts(r.score)}. The reward this week: ${lb.REWARD_WORDS[r.reward]}.${r.winner === me && lb.won() ? ' That is you, in this browser: your reward is on in every run until Sunday at midnight.' : ''}`
    : 'Not announced yet: the developer signs the result on Monday.';
}

show();
