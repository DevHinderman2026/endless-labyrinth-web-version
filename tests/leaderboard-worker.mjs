// The weekly leaderboard's relay (web 7.2.0, leaderboard-worker/worker.js), run in Node
// with GitHub played by a stand-in. Run: node tests/leaderboard-worker.mjs
// (The first argument, a website address, is ignored: nothing here needs the site.)

import worker from '../leaderboard-worker/worker.js';

let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const env = { SCORES_REPO: 'Owner/scores', ALLOWED_ORIGINS: 'https://devhinderman2026.github.io', MAX_PER_MINUTE: '2000', MIN_GAP: '20', GITHUB_TOKEN: 'secret-token' };
const ORIGIN = 'https://devhinderman2026.github.io';
const ID1 = 'a'.repeat(32); const ID2 = 'b'.repeat(32);

// GitHub, as the Worker sees it: files by path, each with a sha; a PUT with a stale sha is refused.
const files = new Map(); let shaN = 0; const seen = []; let clashOnce = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  seen.push({ url, method: opts.method || 'GET', auth: (opts.headers || {}).Authorization });
  const path = u.pathname.replace('/repos/Owner/scores/contents/', '');
  if ((opts.method || 'GET') === 'GET') {
    const f = files.get(path);
    if (!f) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString('base64') }), { status: 200 });
  }
  const b = JSON.parse(opts.body);
  const f = files.get(path);
  if (clashOnce) { clashOnce = false; files.set(path, { sha: 'other' + (++shaN), text: f ? f.text : JSON.stringify({ week: '', scores: {} }) }); return new Response('{}', { status: 409 }); }
  if ((f && b.sha !== f.sha) || (!f && b.sha)) return new Response('{}', { status: 409 });
  files.set(path, { sha: 's' + (++shaN), text: Buffer.from(b.content, 'base64').toString() });
  return new Response('{}', { status: 201 });
};

const send = (body, origin = ORIGIN, method = 'POST', path = '/score') => worker.fetch(new Request('https://el-leaderboard.example.workers.dev' + path, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
}), env);

const r1 = await send({ id: ID1, score: 500, seconds: 300 });
const j1 = await r1.json();
const week = [...files.keys()][0];
check(r1.status === 200 && j1.ok && j1.best === 500, `a score is saved: ${r1.status} ${JSON.stringify(j1)}`);
check(/^weeks\/\d{4}-\d{2}-\d{2}\.json$/.test(week || ''), `in its week's file: ${week}`);
const monday = new Date(week.slice(6, 16) + 'T12:00:00Z').getUTCDay() === 1;
check(monday, 'the week is named by its Monday');
check(r1.headers.get('Access-Control-Allow-Origin') === ORIGIN, 'the website may read the answer');
check(seen.every((s) => s.auth === 'Bearer secret-token') && !JSON.stringify(j1).includes('secret'), 'the key goes only to GitHub, never back to the page');

const again = await (await send({ id: ID1, score: 900, seconds: 300 })).json();
check(!again.ok && again.why === 'too soon', 'a second score from the same device within 20 seconds is refused');

// Later: a better score replaces the best, a worse one is counted but keeps the best.
const saved = JSON.parse(files.get(week).text);
saved.scores[ID1].last = new Date(Date.now() - 60000).toISOString();
files.set(week, { sha: files.get(week).sha, text: JSON.stringify(saved) });
const better = await (await send({ id: ID1, score: 900, seconds: 300 })).json();
check(better.ok && better.best === 900 && better.better, 'a better score becomes the device\'s best');
const after = JSON.parse(files.get(week).text);
check(after.scores[ID1].runs === 2 && after.scores[ID1].best === 900, `runs and best kept: ${JSON.stringify(after.scores[ID1])}`);
check(Object.keys(after.scores[ID1]).sort().join() === 'best,last,runs', 'nothing but the best, the runs and the time is kept for a device');

// Two devices at once: a clash with another write is read again and retried.
clashOnce = true;
const other = await (await send({ id: ID2, score: 300, seconds: 120 })).json();
check(other.ok && JSON.parse(files.get(week).text).scores[ID2].best === 300, 'a clash with another score being saved is retried');

// Refused.
const bad = async (body, why, origin = ORIGIN) => { const r = await send(body, origin); const j = await r.json(); return r.status >= 400 && (!why || j.why === why); };
check(await bad({ id: 'xyz', score: 5, seconds: 60 }, 'bad id'), 'a malformed device ID is refused');
check(await bad({ id: ID2, score: 0, seconds: 60 }, 'bad score') && await bad({ id: ID2, score: 2.5, seconds: 60 }, 'bad score'), 'a score of nothing, or not a whole number, is refused');
check(await bad({ id: ID2, score: 50, seconds: 3 }, 'bad length'), 'a run of a few seconds is refused');
check(await bad({ id: ID2, score: 50000, seconds: 60 }, 'too many points for the time played'), 'more points than a minute of play can make is refused');
check(await bad({ id: ID2, score: 50, seconds: 60 }, 'origin', 'https://evil.example'), 'another website cannot send scores');
const pre = await send(null, ORIGIN, 'OPTIONS');
check(pre.status === 204 && pre.headers.get('Access-Control-Allow-Methods').includes('POST'), 'the browser\'s preflight is answered for the website');
const home = await send(null, ORIGIN, 'GET', '/');
check(home.status === 200, 'the relay answers a plain visit');

console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
