// The weekly leaderboard's relay (web 7.2.0): a Cloudflare Worker.
//
// The game cannot write to GitHub itself (writing needs a secret key, and everything in
// a web page is public). This Worker holds that key, as a Cloudflare secret that no page
// ever sees, and does one thing: it takes a Chaos Mode score from the game, checks it,
// and keeps each device's best of the week in the scores repository, one file a week:
//
//   weeks/<Monday, Eastern time>.json
//   { "week": "2026-11-23", "updated": "...", "scores": { "<device id>": { "best": 1234, "runs": 5, "last": "..." } } }
//
// A device is only its random ID: no name, no account, nothing else is kept.
//
// Settings (wrangler.toml [vars], and one secret):
//   SCORES_REPO      owner/name of the scores repository (DevHinderman2026/Endless-Labyrinth-score-leaderboard)
//   ALLOWED_ORIGINS  the website's address(es), comma separated (only pages there may send)
//   MAX_PER_MINUTE   the most points a run can plausibly make in a minute of play
//   MIN_GAP          seconds a device must wait between two scores
//   GITHUB_TOKEN     (secret) a fine-grained GitHub token: Contents read and write, on the scores repository only

const TIME_ZONE = 'America/New_York';
const ID = /^[0-9a-f]{32}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
    const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (url.pathname === '/' && request.method === 'GET') return answer(200, { ok: true, what: 'Endless Labyrinth weekly leaderboard relay' });
    if (url.pathname !== '/score' || request.method !== 'POST') return answer(404, { ok: false, why: 'not found' });
    if (!okOrigin) return answer(403, { ok: false, why: 'origin' });
    let body;
    try { body = await request.json(); } catch (e) { return answer(400, { ok: false, why: 'not JSON' }); }
    const checked = check(body, env);
    if (checked.why) return answer(400, { ok: false, why: checked.why });
    try {
      const out = await record(env, weekOf(Date.now()), checked);
      return answer(out.status || 200, out);
    } catch (e) {
      return answer(502, { ok: false, why: 'could not save' });
    }
  },
};

// The score as sent: { id, score, seconds }. Anything impossible is refused.
function check(body, env = {}) {
  if (!body || typeof body !== 'object') return { why: 'no score' };
  const id = String(body.id || '');
  const score = Number(body.score);
  const seconds = Number(body.seconds);
  if (!ID.test(id)) return { why: 'bad id' };
  if (!Number.isInteger(score) || score < 1 || score > 10000000) return { why: 'bad score' };
  if (!Number.isFinite(seconds) || seconds < 10 || seconds > 6 * 3600) return { why: 'bad length' };
  const perMinute = Number(env.MAX_PER_MINUTE || 2000);
  if (score > perMinute * Math.max(1, seconds / 60)) return { why: 'too many points for the time played' };
  return { id, score, seconds: Math.round(seconds) };
}

// The Monday of a moment's week, Eastern time, as YYYY-MM-DD.
function weekOf(ms) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(new Date(ms))) parts[p.type] = p.value;
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[parts.weekday] || 0;
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back)).toISOString().slice(0, 10);
}

// One device's score merged into the week's file (its best, its runs). Two scores at the
// same moment can clash on GitHub; then it reads the file again and tries once more.
function merge(data, { id, score }, now, minGap) {
  const out = data && typeof data === 'object' && data.scores ? data : { week: '', scores: {} };
  const mine = out.scores[id] || { best: 0, runs: 0, last: null };
  if (mine.last && now - Date.parse(mine.last) < minGap * 1000) return { refused: true, best: mine.best };
  const better = score > mine.best;
  out.scores[id] = { best: Math.max(mine.best, score), runs: mine.runs + 1, last: new Date(now).toISOString() };
  out.updated = new Date(now).toISOString();
  return { data: out, best: out.scores[id].best, better };
}

async function record(env, week, score) {
  const api = `https://api.github.com/repos/${env.SCORES_REPO}/contents/weeks/${week}.json`;
  const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'endless-labyrinth-leaderboard', 'X-GitHub-Api-Version': '2022-11-28' };
  for (let tries = 0; tries < 4; tries++) {
    const got = await fetch(api, { headers });
    let data = { week, scores: {} }; let sha;
    if (got.ok) {
      const f = await got.json();
      sha = f.sha;
      data = JSON.parse(decodeURIComponent(escape(atob(f.content.replace(/\n/g, '')))));
    } else if (got.status !== 404) throw new Error(`read ${got.status}`);
    data.week = week;
    const m = merge(data, score, Date.now(), Number(env.MIN_GAP || 20));
    if (m.refused) return { ok: false, status: 429, why: 'too soon', week, best: m.best };
    const text = JSON.stringify(m.data, null, 1) + '\n';
    const put = await fetch(api, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Score for the week of ${week}`, content: btoa(unescape(encodeURIComponent(text))), ...(sha ? { sha } : {}) }),
    });
    if (put.ok) return { ok: true, week, best: m.best, better: m.better };
    if (put.status !== 409 && put.status !== 422) throw new Error(`write ${put.status}`);
  }
  throw new Error('busy');
}
