// Score backups (web 1.1.0), in a real browser engine: a sealed backup file
// round-trips; an edited file is refused; restoring asks first, and combine,
// replace and cancel each do what they say. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/backups.mjs http://localhost:8765
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

const MINE = {
  game: { format: 2, scores: { standard: 4, battle: 22, tower: 3 }, settings: { speechRate: 2, practiced: true }, resetAt: 0,
    stats: { time: { standard: 100, battle: 50, drive: 0, tower: 10, island: 0, chaos: 0, event: 0 }, runs: { standard: 2, battle: 1, drive: 0, tower: 1, island: 0, chaos: 0, event: 0 } } },
  events: { total: 0, events: {
    'pumpkin-hunt-2026': { name: 'Pumpkin Hunt', best: 40, runs: 3, unit: 'point', medal: 'silver', best_when: '2026-11-02' },
    'turkey-hunt-2026-2': { name: 'Turkey Hunt', best: 2, runs: 2, unit: 'enemy' },
  } },
};
const OTHER = {
  game: { format: 2, scores: { standard: 6, battle: 10, chaos: 300 }, settings: { speechRate: 4 }, resetAt: 0,
    stats: { time: { standard: 40, battle: 90, drive: 0, tower: 0, island: 0, chaos: 500, event: 0 }, runs: { standard: 5, battle: 1, drive: 0, tower: 0, island: 0, chaos: 2, event: 0 } } },
  events: { total: 0, events: {
    'pumpkin-hunt-2026': { name: 'Pumpkin Hunt', best: 55, runs: 1, unit: 'point', medal: 'bronze', best_when: '2026-11-03' },
    'gone-event-2026': { name: 'Gone Event', best: 5, runs: 1, unit: 'floor', medal: 'gold' },
  } },
};
const setPlay = (p) => page.evaluate((p) => {
  localStorage.setItem('endless-labyrinth-web', JSON.stringify(p.game));
  localStorage.setItem('endless-labyrinth-web-event-scores', JSON.stringify(p.events));
}, p);
const getPlay = () => page.evaluate(() => ({ game: JSON.parse(localStorage.getItem('endless-labyrinth-web')), events: JSON.parse(localStorage.getItem('endless-labyrinth-web-event-scores')) }));
const status = () => page.locator('#backup-status').textContent();

await page.goto(base + '/backups.html');
await setPlay(MINE);

// ------------------------------------------------------------- the file itself
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'el-backup-'));
let backupPath;
{
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#back-up')]);
  backupPath = path.join(tmp, download.suggestedFilename());
  await download.saveAs(backupPath);
  check(/^Endless Labyrinth backup \d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), `Back up now downloads a dated file: ${download.suggestedFilename()}`);
  const body = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  check(body.endless_labyrinth_backup === 1 && typeof body.seal === 'string' && body.seal.length === 64, 'the file is sealed');
  check(body.game.scores.battle === 22 && body.game.settings.speechRate === 2 && body.game.stats.time.standard === 100 && body.events.events['pumpkin-hunt-2026'].medal === 'silver', 'it holds the scores, settings, stats and event runs');
  check(/Backup file made/.test(await status()), `the page says so: ${await status()}`);
}
{
  const r = await page.evaluate(async () => {
    const b = await import('./js/backup.js');
    const text = await b.makeBackup();
    const ok = await b.readBackup(text);
    const edited = await b.readBackup(text.replace('"battle": 22', '"battle": 999'));
    const junk = await b.readBackup('hello');
    const other = await b.readBackup(JSON.stringify({ endless_labyrinth_backup: 1, seal: 'abc', game: {}, events: {} }));
    return { ok: !ok.error && ok.game.scores.battle === 22, edited: edited.error, junk: junk.error, other: other.error };
  });
  check(r.ok, 'a backup made here reads back');
  check(/has been changed/.test(r.edited), `an edited file is refused: ${r.edited}`);
  check(/not an Endless Labyrinth backup/.test(r.junk) && /has been changed/.test(r.other), `other files are refused: ${r.junk} / ${r.other}`);
}

// ------------------------------------------------------------- restoring: asks first
const otherPath = path.join(tmp, 'other.json');
{
  // A backup of the other device's play, sealed by the page's own code.
  await setPlay(OTHER);
  const text = await page.evaluate(async () => (await import('./js/backup.js')).makeBackup());
  fs.writeFileSync(otherPath, text);
  await setPlay(MINE);
}
await page.setInputFiles('#restore-file', otherPath);
await page.waitForSelector('#restore-choice:not([hidden])');
{
  const summary = await page.locator('#backup-summary').textContent();
  check(/^Backup made on .*: 3 high scores, 8 runs counted, 2 events played\./.test(summary), `the file's date and contents are described before anything changes: ${summary}`);
  const before = await getPlay();
  check(before.game.scores.battle === 22, 'nothing has changed yet');
  await page.click('#cancel');
  check(/Cancelled/.test(await status()) && (await getPlay()).game.scores.battle === 22 && await page.locator('#restore-choice').isHidden(), 'Cancel changes nothing');
}

// ------------------------------------------------------------- combine
await page.setInputFiles('#restore-file', otherPath);
await page.waitForSelector('#restore-choice:not([hidden])');
await page.click('#combine');
{
  const p = await getPlay();
  check(/combined/.test(await status()), `combine says so: ${await status()}`);
  check(p.game.scores.standard === 6 && p.game.scores.battle === 22 && p.game.scores.tower === 3 && p.game.scores.chaos === 300, `the better best on every board: ${JSON.stringify(p.game.scores)}`);
  check(p.game.stats.time.standard === 100 && p.game.stats.time.battle === 90 && p.game.stats.time.chaos === 500 && p.game.stats.runs.standard === 5 && p.game.stats.runs.tower === 1, `the larger total of every stat: ${JSON.stringify(p.game.stats)}`);
  check(p.game.settings.speechRate === 2 && p.game.settings.practiced === true, 'this device\'s settings are kept');
  const ph = p.events.events['pumpkin-hunt-2026'];
  check(ph.best === 55 && ph.runs === 3 && ph.medal === 'silver' && ph.best_when === '2026-11-03', `an event's better run, larger run count and better medal: ${JSON.stringify(ph)}`);
  check(p.events.events['turkey-hunt-2026-2'].best === 2 && p.events.events['gone-event-2026'].medal === 'gold', 'events only one side has are kept');
  check(await page.locator('#restore-choice').isHidden(), 'the choice is put away');
}

// ------------------------------------------------------------- replace
await setPlay(MINE);
await page.setInputFiles('#restore-file', otherPath);
await page.waitForSelector('#restore-choice:not([hidden])');
await page.click('#replace');
{
  const p = await getPlay();
  check(/replaced/.test(await status()), `replace says so: ${await status()}`);
  check(p.game.scores.standard === 6 && p.game.scores.battle === 10 && p.game.scores.tower === undefined && p.game.settings.speechRate === 4, `the backup as it is, settings included: ${JSON.stringify(p.game.scores)} rate ${p.game.settings.speechRate}`);
  check(p.game.resetAt > 0, 'the reset mark is set so an open copy of the game takes these scores');
  check(p.events.events['turkey-hunt-2026-2'] === undefined && p.events.events['gone-event-2026'].best === 5, 'the event runs are the backup\'s');
}

// ------------------------------------------------------------- an edited file in the page
{
  const editedPath = path.join(tmp, 'edited.json');
  fs.writeFileSync(editedPath, fs.readFileSync(otherPath, 'utf8').replace('"chaos": 300', '"chaos": 99999'));
  await page.setInputFiles('#restore-file', editedPath);
  await page.waitForFunction(() => /changed|not an/.test(document.getElementById('backup-status').textContent));
  check(/has been changed/.test(await status()) && await page.locator('#restore-choice').isHidden(), `an edited file is refused with a clear message: ${await status()}`);
  check((await getPlay()).game.scores.chaos === 300, 'and nothing was restored from it');
}
{
  // The game's own store reads a restored save as its own.
  const r = await page.evaluate(async () => {
    const { Store } = await import('./js/storage.js');
    const s = new Store();
    return { chaos: s.scores.chaos, rate: s.settings.speechRate, chaosRuns: s.stats.runs.chaos };
  });
  check(r.chaos === 300 && r.rate === 4 && r.chaosRuns === 2, `the game reads the restored save: ${JSON.stringify(r)}`);
}
check(await page.locator('nav.site a[href="backups.html"][aria-current="page"]').count() === 1, 'Score Backups is in the site links and marked current');
check(errors.length === 0, `no page errors ${errors}`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
