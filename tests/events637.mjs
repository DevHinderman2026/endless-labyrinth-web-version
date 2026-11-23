// Web 6.3.7: the event system swept by an automated player (Fable's review, 22 November 2026).
// Every published event and every template is started from its file and played for a
// while with random gestures, pauses, the help and the quit question, while the game's
// state is watched for things that must never happen:
// - a position, a clock or a level that is not a number;
// - a sound still held after the game has resumed (a beacon silent for good);
// - looping sounds piling up; a sound left playing after the return to the menu;
// - any error in the page.
// Run: node --import ./tests/github-stub.mjs tests/events637.mjs http://localhost:8790 <the Windows repository> [seconds per event]
// The events are read with the game's own checks but without their signatures (a
// template being worked on is not signed yet); signatures have their own tests (events.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
const desk = process.argv[3] || '/home/claude/work/desktop';
const secs = Number(process.argv[4] || 25);
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const files = [];
for (const dir of [path.join(desk, 'events'), path.join(desk, 'Developer Tools', 'templates')]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.json')) files.push([path.basename(dir) + '/' + f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]);
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

const bad = []; let played = 0; const kinds = new Set();
for (const [name, data] of files) {
  const before = errors.length;
  const r = await page.evaluate(async ({ d, secs }) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const { checkEvent } = await import('./js/modes/events/schema.js');
    const G = window.__el.game; const a = G.audio; const out = { odd: [] };
    const [ev, errs] = checkEvent(d);
    if (!ev || errs.length) { out.skipped = errs.slice(0, 2).join(' | ') || 'not read'; return out; }
    out.mission = ev.mission || (ev.mode || '');
    if (G.state !== 'menu') { G._stopRunSounds(); G.runId += 1; }
    G._toMenu(''); G.state = 'events_menu';
    G._eventLoadThenStart(ev);
    for (let i = 0; i < 300 && G.state !== 'event'; i++) await sleep(50);
    if (G.state !== 'event') { out.odd.push('did not start: ' + G.state); return out; }
    const num = (x) => typeof x === 'number' && Number.isFinite(x);
    const note = (s) => { if (out.odd.length < 6 && !out.odd.includes(s)) out.odd.push(s); };
    const moves = ['up', 'down', 'left', 'right', 'up', 'up', 'space', 'enter', 'clock', 'up', 'right', 'left'];
    let most = 0; let ended = false;
    for (let i = 0; i < 30 * secs; i++) {
      if (G.state !== 'event') { ended = true; break; }
      G.frame(1 / 30);
      if (G.state !== 'event') { ended = true; break; }
      if (i % 7 === 0) G.input(moves[Math.floor(Math.random() * moves.length)]);
      if (G.state === 'event' && i % 97 === 50) {
        // A pause, a moment held, and carrying on.
        G.input('pause'); const held = G.pausedVoices.length;
        await sleep(1 + (i % 13));
        for (let k = 0; k < 3; k++) G.frame(1 / 30);
        if (G.isPaused) G.input('pause');
        if (G.isPaused) note('still paused after the second pause gesture');
        if (G.pausedVoices.length) note('sounds still listed as held after the resume: ' + G.pausedVoices.length + ' of ' + held);
      }
      if (G.state === 'event' && i % 211 === 100) { G.input('help'); for (let k = 0; k < 3; k++) G.frame(1 / 30); if (G.state === 'help') { G.input('back'); if (G.state === 'help') G.input('back'); } }
      if (G.state === 'event' && i % 233 === 150) { G.input('back'); if (G.state === 'confirm_exit') G.input('no'); }
      if (G.state === 'event' && !G.isPaused && i % 5 === 0) {
        if (!num(G.playerPos[0]) || !num(G.playerPos[1])) note('the player is nowhere: ' + G.playerPos);
        if (G.timeLeft !== undefined && G.timeLeft !== null && Number.isNaN(G.timeLeft)) note('the clock is not a number');
        const stuck = [...a.live].filter((v) => v.paused && !v.stopped && !v.ended);
        if (stuck.length) note('held while the game runs: ' + [...new Set(stuck.map((v) => v.name))].slice(0, 3).join(', '));
        for (const v of a.live) if (!num(v.l) || !num(v.r)) note('a level that is not a number: ' + v.name);
        for (const t of G.evItems || []) if (!num(t.x) || !num(t.y)) note('an item that is nowhere');
        for (const h of G.evHazards || []) if (!num(h.x) || !num(h.y)) note('a creature that is nowhere');
        // (Loops only: this player runs the game faster than its sounds play, so the
        // one-shots of many seconds overlap here as they never do for a person.)
        let loops = 0; for (const v of a.live) if (v.loop && !v.fadingOut) loops += 1;
        most = Math.max(most, loops);
      }
      if (i % 60 === 0) await sleep(1);
    }
    out.ended = ended; out.most = most;
    if (most > 60) note('looping sounds piling up: ' + most + ' at once');
    if (G.state === 'event') { G.input('back'); if (G.state === 'confirm_exit') { G.input('up'); if (!G.confirmYes) G.input('up'); G.input('enter'); } }
    else if (G.state === 'game_over') G.input('enter');
    if (G.state !== 'menu') { G._stopRunSounds(); G.runId += 1; G._toMenu(''); note('did not come back to the menu by itself: ' + G.state); }
    const left = [...a.live].filter((v) => v.loop && v.busy && !v.fadingOut).map((v) => v.name);
    if (left.length) note('left playing at the menu: ' + left.slice(0, 3).join(', '));
    for (const v of [...a.live]) if (v.loop) v.stop();
    return out;
  }, { d: data, secs });
  if (r.skipped) { bad.push(`${name}: not read by the game's checks: ${r.skipped}`); continue; }
  played += 1; if (r.mission) kinds.add(r.mission);
  const errs = errors.slice(before);
  if (r.odd.length || errs.length) bad.push(`${name}: ${[...r.odd, ...errs.map((e) => 'error: ' + e.slice(0, 160))].join(' | ')}`);
}
check(played === files.length, `${played} of ${files.length} events and templates were started from their files`);
check(bad.length === 0, `each played ${secs} seconds with random gestures, pauses, help and the quit question: nothing odd${bad.length ? ': ' + bad.slice(0, 12).join(' || ') : ''}`);
check(errors.length === 0, 'no errors in the page: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
