// Web 8.1.0 (Russell, 26 November 2026): The Abyss's board and its Game Stats are reset
// once on every device, and nothing from before the reset brings them back: not the save
// itself, not another tab still holding the old numbers, not a backup made before it. A
// backup made after the reset brings them back as usual. Every other board, its stats, and
// the Event High Scores are untouched. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/web810.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/backups.html');

const OLD = {
  format: 2, scores: { standard: 9, abyss: 74, edge: 3, chaos: 410 }, settings: { speechRate: 2 }, resetAt: 1795287600000,
  stats: { time: { standard: 100, abyss: 3000, edge: 60, chaos: 900 }, runs: { standard: 4, abyss: 31, edge: 2, chaos: 5 } },
};
const EVENTS = { total: 0, events: { 'pumpkin-hunt-2026': { name: 'Pumpkin Hunt', best: 40, runs: 3, unit: 'point' } } };

const r = await page.evaluate(async ({ OLD, EVENTS }) => {
  const S = await import('./js/storage.js');
  const B = await import('./js/backup.js');
  const ST = await import('./js/stats.js');
  const KEY = S.KEY; const out = {};
  const put = (g) => localStorage.setItem(KEY, JSON.stringify(g));
  const get = () => JSON.parse(localStorage.getItem(KEY));
  localStorage.setItem('endless-labyrinth-web-event-scores', JSON.stringify(EVENTS));
  out.mark = S.BOARD_RESETS.abyss;
  // The stats page, before the game is opened on 8.1.0: The Abyss already shows none.
  put(OLD);
  const pv = ST.readPlay(); out.page = [pv.scores.abyss || 0, pv.stats.time.abyss, pv.stats.runs.abyss, pv.scores.chaos, pv.stats.time.chaos];
  // An old backup, made before the reset.
  const oldBackup = await B.readBackup(await B.makeBackup({ game: OLD, events: EVENTS }));
  // The save, opened on 8.1.0: The Abyss reset, nothing else.
  const s1 = new S.Store();
  const g1 = get();
  out.load = { scores: { ...s1.scores }, abyssTime: s1.stats.time.abyss, abyssRuns: s1.stats.runs.abyss, chaosTime: s1.stats.time.chaos, edgeRuns: s1.stats.runs.edge, mark: (g1.boardResets || {}).abyss, saved: g1.scores.abyss };
  // A new Abyss best after the reset is kept, and opening again does not reset it.
  s1.update('abyss', 12); s1.runStarted('abyss');
  const s2 = new S.Store();
  out.again = [s2.scores.abyss, s2.stats.runs.abyss];
  // Another tab, still on the old game, writes the old numbers back: this copy takes none of The Abyss's.
  put({ ...OLD, scores: { ...OLD.scores, chaos: 500 } });
  s2.refresh();
  out.tab = [s2.scores.abyss, s2.stats.time.abyss, s2.stats.runs.abyss, s2.scores.chaos, s2.stats.time.chaos];
  s2.save();
  // Backups: the old one, combined and replaced, brings everything back but The Abyss.
  const mine = { game: get(), events: EVENTS };
  const comb = B.combine(mine, oldBackup);
  out.combine = [comb.game.scores.abyss, comb.game.stats.time.abyss, comb.game.stats.runs.abyss, comb.game.scores.standard, comb.game.scores.chaos, comb.game.stats.time.standard, (comb.game.boardResets || {}).abyss];
  const repl = B.replacement(oldBackup);
  out.replace = [repl.game.scores.abyss || 0, repl.game.stats.time.abyss, repl.game.stats.runs.abyss, repl.game.scores.edge, repl.game.scores.chaos, repl.game.stats.runs.chaos, (repl.game.boardResets || {}).abyss, repl.events.events['pumpkin-hunt-2026'].best];
  out.describeOld = B.describe(oldBackup);
  // Written and opened again: still no old Abyss.
  B.writePlay(repl); const s3 = new S.Store(); out.afterReplace = [s3.scores.abyss || 0, s3.stats.runs.abyss, s3.scores.chaos];
  // A backup made from now on carries The Abyss back.
  { const now = get(); now.scores.abyss = 15; now.stats.runs.abyss = 2; put(now); }
  const newBackup = await B.readBackup(await B.makeBackup());
  put({ format: 2, scores: {}, settings: {}, resetAt: Date.now(), boardResets: { ...S.BOARD_RESETS }, stats: S.emptyStats() });
  const comb2 = B.combine({ game: get(), events: EVENTS }, newBackup);
  const repl2 = B.replacement(newBackup);
  out.newBackup = [comb2.game.scores.abyss, comb2.game.stats.runs.abyss, repl2.game.scores.abyss, repl2.game.stats.runs.abyss];
  out.describeNew = B.describe(newBackup);
  return JSON.parse(JSON.stringify(out));
}, { OLD, EVENTS });

check(r.mark === Date.UTC(2026, 10, 26, 21, 0, 0), 'one board has a reset of its own: The Abyss, 26 November 2026');
check(r.page[0] === 0 && r.page[1] === 0 && r.page[2] === 0 && r.page[3] === 410 && r.page[4] === 900, 'the Game Stats page shows no Abyss score or stats from before the reset, even before the game is opened: ' + JSON.stringify(r.page));
const L = r.load;
check(L.scores.abyss === 0 && L.abyssTime === 0 && L.abyssRuns === 0 && L.saved === 0 && L.mark === r.mark, 'opened on 8.1.0, The Abyss\'s score, play time and runs go to zero, and the save is marked: ' + JSON.stringify(L));
check(L.scores.standard === 9 && L.scores.edge === 3 && L.scores.chaos === 410 && L.chaosTime === 900 && L.edgeRuns === 2, 'every other board and its stats, The Edge and Chaos included, are untouched');
check(r.again[0] === 12 && r.again[1] === 1, 'a new Abyss best after the reset is kept: it is reset only once: ' + JSON.stringify(r.again));
check(r.tab[0] === 12 && r.tab[1] === 0 && r.tab[2] === 1 && r.tab[3] === 500 && r.tab[4] === 900, 'another tab with the old numbers brings back none of The Abyss\'s, but its other records still count: ' + JSON.stringify(r.tab));
check(r.combine[0] === 12 && r.combine[1] === 0 && r.combine[2] === 1 && r.combine[3] === 9 && r.combine[4] === 500 && r.combine[5] === 100 && r.combine[6] === r.mark, 'combining a backup from before the reset brings back everything but The Abyss: ' + JSON.stringify(r.combine));
check(r.replace[0] === 0 && r.replace[1] === 0 && r.replace[2] === 0 && r.replace[3] === 3 && r.replace[4] === 410 && r.replace[5] === 5 && r.replace[6] === r.mark && r.replace[7] === 40, 'replacing with it brings back everything but The Abyss, events included: ' + JSON.stringify(r.replace));
check(/3 high scores, 11 runs counted/.test(r.describeOld), 'the restore question counts what would come back, without The Abyss: ' + r.describeOld);
check(r.afterReplace[0] === 0 && r.afterReplace[1] === 0 && r.afterReplace[2] === 410, 'and the game, opened again, keeps The Abyss at zero: ' + JSON.stringify(r.afterReplace));
check(r.newBackup[0] === 15 && r.newBackup[1] === 2 && r.newBackup[2] === 15 && r.newBackup[3] === 2, 'a backup made after the reset brings The Abyss back, combined or replaced: ' + JSON.stringify(r.newBackup));
check(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
