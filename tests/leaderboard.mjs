// The weekly leaderboard (web 7.2.0): the week, the device's ID, a Chaos score sent,
// the board read, a signed result believed (and a forged one not), the reward in every
// mode, the menu and the ceremony. Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/leaderboard.mjs http://localhost:8790
// The relay, the scores repository and the results are all played by stand-ins here.

import { chromium } from 'playwright';
import crypto from 'node:crypto';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// A key of our own, standing in for the developer's, to sign results with.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubHex = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
const canon = (o) => '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + JSON.stringify(o[k])).join(',') + '}';
const signed = (body, key = privateKey) => JSON.stringify({ ...body, signature: crypto.sign(null, Buffer.from(canon(body)), key).toString('hex') }, null, 2);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const posts = []; let board = null; let resultText = null;
await page.route('https://raw.githubusercontent.com/**', (route) => {
  const u = route.request().url();
  if (u.includes('/weeks/') && board) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(board) });
  if (u.includes('/leaderboard/') && resultText) return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: resultText });
  return route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '404' });
});
await page.route('https://relay.test/**', (route) => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } });
  posts.push(JSON.parse(route.request().postData()));
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
});
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const t = window.__t = { said: [], played: [], bella: [] };
  const play = a.play.bind(a);
  a.play = (name, opts) => { t.played.push(name); return play(name, opts); };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o = {}) => { if (text) { t.said.push(text); if (o.bella) t.bella.push(text); } return speak(text, o); };
  t.lb = await import('./js/leaderboard.js');
  t.frames = async (seconds, dt = 1 / 30) => { for (let i = 0; i < Math.round(seconds / dt); i++) { g.frame(dt); if (i % 15 === 0) await new Promise((r) => setTimeout(r, 1)); } };
  t.start = (key) => {
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    g.menuIndex = g.menuKeys.indexOf(key); g.input('enter'); g.frame(1 / 30);
  };
});

// ------------------------------------------------------------------ the week and the device
const basics = await page.evaluate(() => {
  const lb = window.__t.lb;
  const at = (iso) => lb.weekOf(Date.parse(iso));
  return {
    sunLate: at('2026-11-30T04:30:00Z'),      // Sunday 29 Nov, 11:30 PM Eastern
    monEarly: at('2026-11-30T05:10:00Z'),     // Monday 30 Nov, 12:10 AM Eastern
    wed: at('2026-11-25T18:00:00Z'),
    summer: at('2026-07-06T03:59:00Z'),       // Sunday 5 July, 11:59 PM Eastern (summer time)
    next: lb.addWeeks('2026-11-23', 1), prev: lb.addWeeks('2026-11-23', -1), words: lb.weekWords('2026-11-23'),
    id: lb.deviceId(), id2: lb.deviceId(), stored: localStorage.getItem('endless-labyrinth-web-device-id'),
    menu: window.__el.game.menuKeys,
  };
});
check(basics.sunLate === '2026-11-23' && basics.monEarly === '2026-11-30' && basics.wed === '2026-11-23' && basics.summer === '2026-06-29', `a week runs Monday to Sunday, Eastern time: ${basics.sunLate}, ${basics.monEarly}, ${basics.wed}, ${basics.summer}`);
check(basics.next === '2026-11-30' && basics.prev === '2026-11-16' && basics.words === 'Monday 23 November', 'the weeks before and after, and its name');
check(/^[0-9a-f]{32}$/.test(basics.id) && basics.id === basics.id2 && basics.stored === basics.id, 'a random ID for this device, made once and kept');
check(basics.menu.indexOf('weekly') === basics.menu.indexOf('scores') + 1, 'Weekly Leaderboard is on the main menu after High Scores');

// ------------------------------------------------------------------ a Chaos score sent
const sent = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const lb = t.lb;
  const none = lb.submit(500, 120);          // no relay address yet: nothing is sent
  lb._setRelay('https://relay.test');
  t.start('chaos');
  await t.frames(12.0);
  g.chaosPoints = 480; g.islandPoints = 20;
  g.triggerGameOver();
  await new Promise((r) => setTimeout(r, 500));
  // A standard run's score is not sent.
  t.start('standard'); await t.frames(1.0); g.level = 7; g.triggerGameOver();
  await new Promise((r) => setTimeout(r, 300));
  return { none, id: lb.deviceId() };
});
check(sent.none === false, 'with no relay address, nothing is sent');
check(posts.length === 1 && posts[0].score === 500 && posts[0].id === sent.id && posts[0].seconds >= 11 && posts[0].seconds <= 20, `a Chaos run's points go to the relay, with the device's ID and the run's length: ${JSON.stringify(posts[0])}`);
check(posts.length === 1 && Object.keys(posts[0]).sort().join() === 'at,id,score,seconds,week', 'nothing else is sent, and no other mode\'s score');

// ------------------------------------------------------------------ the signed result
const me = sent.id;
const thisWeek = await page.evaluate(() => window.__t.lb.weekOf());
const lastWeek = await page.evaluate(() => { const lb = window.__t.lb; return lb.addWeeks(lb.weekOf(), -1); });
const body = { format: 1, kind: 'weekly leaderboard', week: lastWeek, score: 2345, winner: me, reward: 'time', players: 7 };
const good = signed(body);
const forged = JSON.stringify({ ...JSON.parse(good), winner: 'c'.repeat(32) });
const { privateKey: otherKey } = crypto.generateKeyPairSync('ed25519');
const res = await page.evaluate(async ({ good, forged, foreign, pubHex }) => {
  const lb = window.__t.lb;
  return { good: await lb.readResult(good, pubHex), forged: await lb.readResult(forged, pubHex), foreign: await lb.readResult(foreign, pubHex), devKey: JSON.stringify(await lb.readResult(good)) };
}, { good, forged, foreign: signed(body, otherKey), pubHex });
check(res.good && res.good.winner === me && res.good.score === 2345 && res.good.reward === 'time' && res.good.players === 7, 'a result signed with the key is believed');
check(res.forged === null && res.foreign === null, 'a result changed after signing, or signed with another key, is not');
check(res.devKey === 'null', `${res.devKey}: ` +  'and the game believes only the developer\'s own key');

// ------------------------------------------------------------------ the rewards
const rewards = await page.evaluate(async ({ me, lastWeek }) => {
  const g = window.__el.game; const t = window.__t; const lb = t.lb;
  const out = {};
  const as = (reward, winner = me, week = lastWeek) => lb._setResult({ week, score: 2345, winner, reward, players: 7 });
  as(null); lb._reset();
  t.start('standard'); out.plain = Math.round(g.timeLeft);
  as('time');
  t.start('standard'); out.std = Math.round(g.timeLeft);
  t.start('battle'); out.battleT = Math.round(g.timeLeft);
  t.start('chaos'); out.chaosT = Math.round(g.timeLeft);
  t.start('abyss'); out.abyssT = Math.round(g.timeLeft);
  t.start('park'); out.parkT = Math.round(g.timeLeft);
  as('ammo');
  t.start('drive'); out.drive = g.ammo;
  t.start('island'); out.island = g.ammo;
  t.start('chaos'); out.chaosA = g.ammo; out.pools = JSON.stringify(g.chaosAmmo);
  as('health');
  t.start('tower'); out.tower = g.towerHp;
  t.start('chaos'); out.chaosH = g.towerHp; out.fv = g.chaosFvLives; out.ab = g.chaosAbyssLives;
  t.start('findvoice'); await t.frames(0.2); out.fvLives = g.fv && g.fv.lives;
  // Someone else's win, or an old week's: nothing.
  as('time', 'c'.repeat(32));
  t.start('standard'); out.other = Math.round(g.timeLeft);
  as('time', me, lb.addWeeks(lastWeek, -1));
  t.start('standard'); out.old = Math.round(g.timeLeft);
  g._stopRunSounds(); g.runId += 1; g.state = 'menu';
  return out;
}, { me, lastWeek });
check(rewards.plain === 60 && rewards.std === 90, `time: 30 extra seconds on Standard's clock (${rewards.plain} -> ${rewards.std})`);
check(rewards.battleT === 110 && rewards.chaosT === 330 && rewards.abyssT === 75 && rewards.parkT === 160, `...and on Battle's, Chaos's, the Abyss's and a park's: ${rewards.battleT}, ${rewards.chaosT}, ${rewards.abyssT}, ${rewards.parkT}`);
check(rewards.drive === 12 && rewards.island === 12 && rewards.chaosA === 12 && rewards.pools === '{"battle":12,"island":12,"drive":12}', `ammo: 50% more (8 -> 12) on the road, on an island, and in each of Chaos's supplies: ${rewards.drive}, ${rewards.island}, ${rewards.pools}`);
check(rewards.tower === 125 && rewards.chaosH === 125, `health: 25% more in a tower and in Chaos: ${rewards.tower}, ${rewards.chaosH}`);
check(rewards.fv === 4 && rewards.ab === 4, `...and one extra life in Chaos's Find the Voice rooms and abysses: ${rewards.fv}, ${rewards.ab}`);
check(rewards.other === 60 && rewards.old === 60, 'another device\'s win, or a win from an older week, gives nothing');

// ------------------------------------------------------------------ the menu and the ceremony
board = { week: thisWeek, scores: { [me]: { best: 500, runs: 2, last: '' }, ['d'.repeat(32)]: { best: 900, runs: 1, last: '' }, ['e'.repeat(32)]: { best: 120, runs: 1, last: '' } } };
resultText = good;
const menu = await page.evaluate(async ({ me, lastWeek, pubHex }) => {
  const g = window.__el.game; const t = window.__t; const lb = t.lb;
  lb._reset();
  // The published result is read with the stand-in key: the game's own read is told to use it.
  const real = lb.readResult;
  t.lb._setResult(await lb.readResult(await (await fetch(lb.RESULTS_RAW + lastWeek + '.json')).text(), pubHex));
  g.state = 'menu'; g.menuIndex = g.menuKeys.indexOf('weekly');
  t.said.length = 0;
  g.input('enter');
  for (let i = 0; i < 60 && g.lbLines.length < 3; i++) await new Promise((r) => setTimeout(r, 50));
  const lines = [...g.lbLines];
  const ci = g.lbItems.indexOf('ceremony');
  g.lbIndex = ci;
  t.played.length = 0; t.bella.length = 0;
  g.input('enter');
  const words = t.bella[0];
  // The words are said; then the pen (when it is in the game), then the applause.
  for (let i = 0; i < 400 && !t.played.some((n) => n === 'lb_applause' || n === 'ut_crowd_roar_1'); i++) await new Promise((r) => setTimeout(r, 50));
  const order = t.played.filter((n) => ['lb_pen', 'lb_applause', 'ut_crowd_roar_1'].includes(n));
  g.input('back');
  return { lines, words, order, state: g.state, real: typeof real };
}, { me, lastWeek, pubHex });
check(menu.lines[0].startsWith('This week, from Monday') && menu.lines[0].includes('3 players'), 'the menu: this week, and how many players: ' + menu.lines[0]);
check(menu.lines[1] === 'First place: 900 points.' && menu.lines[2] === 'Second place: 500 points. That is you.' && menu.lines[3] === 'Third place: 120 points.', 'the top scores, best first, with no names, and which is yours: ' + menu.lines.slice(1, 4).join(' | '));
check(menu.lines.includes('Your best this week: 500 points, place 2 of 3.'), 'your own best this week, and your place');
check(menu.lines.some((l) => l.startsWith('Last week\'s winner scored 2345 points.') && l.includes('30 extra seconds') && l.includes('That is you!')), 'last week\'s signed winner, the reward, and that it is you');
check(menu.lines.some((l) => l.startsWith('How it works.')) && menu.lines[menu.lines.length - 1] === 'Back to the main menu.', 'how it works, and the way back');
check(/^Congratulations! You are last week's winner, with 2345 points\./.test(menu.words || ''), 'the ceremony: the winner congratulated, with the score and the reward: ' + menu.words);
check(menu.order.length >= 1 && (menu.order[menu.order.length - 1] === 'lb_applause' || menu.order[menu.order.length - 1] === 'ut_crowd_roar_1') && (menu.order.length === 1 || menu.order[0] === 'lb_pen'), 'after the words, the pen signing, then the applause: ' + menu.order.join(', '));
check(menu.state === 'menu', 'triple tap goes back to the main menu');

// The winner's ceremony plays by itself once, on the main menu.
const auto = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  localStorage.removeItem('endless-labyrinth-web-leaderboard-ceremony');
  t.bella.length = 0;
  g._toMenu();
  const first = t.bella.length;
  g._toMenu();
  return { first, second: t.bella.length };
});
check(auto.first === 1 && auto.second === 1, `the winner hears the ceremony by itself once, on the main menu (${auto.first}, then ${auto.second})`);

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
