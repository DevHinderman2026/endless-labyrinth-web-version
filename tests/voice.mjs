// The game's recorded voices (web 6.1.0): js/voice.js, js/voice-text.js, js/speech.js,
// the voice packs (packs/voice-*.elpack) and their list (tools/voice/voice-lines.json).
// Run with the site served:
//   node --import ./tests/github-stub.mjs tests/voice.mjs http://localhost:8765 [the Windows game's folder]
//
// Russell (19 November 2026): the live Kokoro engine is gone from the website; every
// line the game says during a run, the Find the Voice guide's calls and every safe
// zone character's line is a recording, made once in Claude's workspace. Checked:
// nothing of the live engine is left (no worker, no ONNX Runtime, no model download,
// the service worker retired); every recording in the list is in the packs and the
// other way round; every phrase of the guide and every line of the characters has its
// recording (and the Windows game's guide files are the very same bytes); every line
// the game was heard to say in a run (tests/voice-capture.json, from
// tools/voice/capture.mjs) and every line it builds itself can be said by the
// recordings; and in the browser, that the speech plays them, in order and on time,
// with nothing left to the device's voice, and that a line with no recording is the
// device voice's. How they sound is for listening.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { plan, makeIndex, sentenceParts, MAX_LONE_WORDS } from '../js/voice-text.js';

const base = process.argv[2] || 'http://localhost:8765';
const desktop = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Endless Labyrinth');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

// ------------------------------------------------------------------ the live engine is gone
const js = (n) => readFileSync(join(root, 'js', n), 'utf8');
check(!existsSync(join(root, 'js', 'bella.js')) && !existsSync(join(root, 'js', 'bella-worker.js')) && !existsSync(join(root, 'js', 'isolate.js')),
  'the live voice is gone: no js/bella.js, js/bella-worker.js or js/isolate.js');
const allJs = [];
const walk = (d) => { for (const n of readdirSync(d, { withFileTypes: true })) { const p = join(d, n.name); if (n.isDirectory()) walk(p); else if (n.name.endsWith('.js')) allJs.push(p); } };
walk(join(root, 'js'));
const code = allJs.map((p) => readFileSync(p, 'utf8')).join('\n');
check(!/onnxruntime|huggingface\.co|cdn\.jsdelivr|InferenceSession|KokoroEngine|bella-worker/.test(code) && !/Worker/.test(js('voice.js') + js('speech.js')), 'no ONNX Runtime, no model download, no voice worker anywhere in the game');
const pages = readdirSync(root).filter((n) => n.endsWith('.html'));
const html = pages.map((n) => readFileSync(join(root, n), 'utf8'));
check(html.every((h) => !/bella\.js|bella-worker|isolate\.js/.test(h)) && html.some((h) => /js\/voice\.js/.test(h)),
  'no page names the old files; the import maps name js/voice.js');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
check(/registration\.unregister\(\)/.test(sw) && !/addEventListener\('fetch'/.test(sw), 'the old service worker is retired: sw.js only takes itself away, and touches no request');
check(/af_bella|recordings/.test(js('voice.js')) && /plan\(text, this\.library\.index\)/.test(js('voice.js')), 'Bella plays the recordings that plan() picks');

// ------------------------------------------------------------------ the packs and the list
const manifest = JSON.parse(readFileSync(join(root, 'packs', 'manifest.json'), 'utf8'));
const voicePacks = Object.entries(manifest.packs).filter(([k]) => k.startsWith('voice'));
const entries = [];
for (const [, p] of voicePacks) {
  const buf = readFileSync(join(root, 'packs', p.file));
  check(buf.length === p.bytes && buf.slice(0, 8).toString() === 'ELPACK1\n', `${p.file}: whole, ${(p.bytes / 1e6).toFixed(1)} MB` + (p.bytes > 25e6 ? ' (OVER 25 MB)' : ''));
  const n = buf.readUInt32LE(8);
  const head = JSON.parse(buf.slice(12, 12 + n).toString('utf8'));
  for (const e of head.entries) entries.push({ ...e, data: buf.slice(12 + n + e.offset, 12 + n + e.offset + e.length) });
}
const byName = new Map(entries.map((e) => [e.name, e]));
check(voicePacks.length >= 3 && voicePacks.every(([, p]) => p.bytes <= 25e6), `${voicePacks.length} voice packs, none over 25 MB`);
check(entries.every((e) => e.kind === 'voice' && e.data.slice(0, 4).toString() === 'OggS' && e.data.includes(Buffer.from('vorbis'))), `all ${entries.length} recordings are Ogg Vorbis entries of kind voice`);
const list = JSON.parse(readFileSync(join(root, 'tools', 'voice', 'voice-lines.json'), 'utf8'));
const listed = [...list.bella, ...list.guide, ...list.cast].map((r) => r.name);
check(listed.length === entries.length && listed.every((n) => byName.has(n)), `the list and the packs hold the same recordings (${listed.length} listed, ${entries.length} packed)`);
const bellaEntries = entries.filter((e) => e.name.startsWith('vb_'));
check(bellaEntries.every((e) => e.key && (e.end === 0 || e.end === 1) && ['line', 'num', 'word'].includes(e.k)), 'every one of Bella\'s recordings says which words it says');
const guide = JSON.parse(readFileSync(join(root, 'js', 'data', 'guide_phrases.json'), 'utf8'));
check(guide.phrases.every((p) => byName.has('vg_' + p.id)) && entries.filter((e) => e.name.startsWith('vg_')).length === guide.phrases.length,
  `every one of the guide's ${guide.phrases.length} phrases has its recording, and no more`);
const story = JSON.parse(readFileSync(join(root, 'js', 'data', 'story-lines.json'), 'utf8'));
check(story.lines.every((l) => byName.has('vc_' + l.id)) && entries.filter((e) => e.name.startsWith('vc_')).length === story.lines.length,
  `every one of the characters' ${story.lines.length} lines has its recording, and no more`);
const cast = JSON.parse(readFileSync(join(root, 'js', 'data', 'safe-zone-cast.json'), 'utf8'));
const voiceOf = new Map(cast.characters.map((c) => [c.id, c.voice]));
check(list.cast.every((r) => { const l = story.lines.find((x) => 'vc_' + x.id === r.name); return l && r.voice === voiceOf.get(l.character) && r.text === l.text; }),
  'each character\'s lines are in that character\'s own voice, word for word');
check(new Set(cast.characters.map((c) => c.voice)).size === cast.characters.length, 'no two characters share a voice');
const winSounds = join(desktop, 'Dev Builds', 'sounds');
if (existsSync(winSounds)) {
  const same = guide.phrases.every((p) => { const f = join(winSounds, `ftv_guide_${p.id}.ogg`); return existsSync(f) && readFileSync(f).equals(byName.get('vg_' + p.id).data); });
  check(same, 'the Windows game\'s guide recordings (sounds/ftv_guide_<id>.ogg) are the very same files');
} else console.log('(The Windows game\'s folder was not found: its guide files are not compared.)');

// ------------------------------------------------------------------ every line can be said
const index = makeIndex(bellaEntries);
const capFile = join(root, 'tests', 'voice-capture.json');
if (existsSync(capFile)) {
  const cap = JSON.parse(readFileSync(capFile, 'utf8'));
  const missed = cap.filter((c) => !plan(c.text, index));
  check(cap.length > 400 && missed.length === 0, `every one of the ${cap.length} lines heard in runs of every mode and event can be said by the recordings ${JSON.stringify(missed.slice(0, 3).map((m) => m.text))}`);
  const lone = cap.map((c) => plan(c.text, index)).filter((p) => p && p.some((s) => s.filter((x) => x.kind === 'word').length > MAX_LONE_WORDS));
  check(lone.length === 0, `never more than ${MAX_LONE_WORDS} words on their own in a sentence`);
} else check(false, 'tests/voice-capture.json is missing (made by tools/voice/capture.mjs)');
const built = [
  'Ring once.', 'Ring 3 times.', 'Ring 17 times.', 'Find 2 real bells.', 'Level 12.', '45 seconds remaining.',
  '1 second left.', '2 minutes left.', 'Wave 3, 5 left. Clock 87 seconds.', 'Wave break, 4 seconds. Clock 12 seconds.',
  'Floor 4 of 9.', 'Health low. 23.', 'Tower 2 complete. 3 bonus items.', 'Compass ready in 5 seconds.',
  'Compass on.', 'Low air.', 'Level 1.', 'Level 7.', 'Caught. 2 lives left.', 'Caught. 1 life left.',
  '4 of 5 found.', 'All 5 found.', '12 more seconds.',
  "You've just received 25 shots of ammo.", "You've just received 40 health.", "You've just received 3 tower items.",
  "You've just received 12 shots of ammo and 30 health.", "You've just received 12 shots of ammo, 30 health and 1 tower item.",
  "You've just received 2 more minutes in this world, and 3 and a half minutes on the clock.",
  "You've just received a treasure chest.", 'The world shows you mercy. 35 more seconds.',
  'Compass ready in 1 second.', '45 more seconds in this world.', '1,240 points total.', 'It was 7.',
  ...['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
    'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'].map((w) => `Facing ${w}.`),
];
const notBuilt = built.filter((l) => !plan(l, index));
check(!notBuilt.length, `lines the game builds itself can all be said ${JSON.stringify(notBuilt)}`);
let numbersOk = true;
for (let n = 0; n <= 20000; n += 1) if (!plan(`${n}.`, index) || !plan(`Clock ${n} seconds.`, index)) { numbersOk = false; console.log('  not said: ' + n); break; }
check(numbersOk, 'every number from 0 to 20,000 can be said, at the end of a sentence and within one');
const whole = plan('Ring 5 times.', index);
check(whole && whole[0].length === 1 && plan('Level 12.', index)[0].length === 1, 'the lines said most are whole recordings, not joined: "Ring 5 times.", "Level 12."');
check(plan('Press the zorblax key.', index) === null && plan('Score: 5 / 10', index) === null, 'a line with a word or sign that has no recording is not Bella\'s');

// ------------------------------------------------------------------ the Fable review's fixes (6.1.0)
{
  const { VoiceLibrary, GuideVoice, KEEP_BYTES } = await import('../js/voice.js');
  const { coverSentence } = await import('../js/voice-text.js');
  // Recordings in use are never let go to be decoded again a frame later, even over the limit.
  const big = Math.ceil(KEEP_BYTES / 4 / 2.5);     // each "recording" is 40% of the limit
  const fake = { entries: new Map(), _decodeEntry: async () => ({ length: big, numberOfChannels: 1 }) };
  for (const n of ['a', 'b', 'c', 'd', 'e']) fake.entries.set('vc_' + n, { voice: { name: 'vc_' + n } });
  const lib = new VoiceLibrary(fake);
  lib.attach();
  for (const n of ['a', 'b', 'c', 'd']) await lib.get('vc_' + n);
  const allKept = ['a', 'b', 'c', 'd'].every((n) => lib.kept.has('vc_' + n));
  for (const k of lib.kept.values()) k.used = -1e9;   // ... a long while later
  await lib.get('vc_e');
  check(allKept && lib.bytes <= KEEP_BYTES && lib.kept.has('vc_e'), 'recordings in use are all kept, even over the limit; ones not used for a while are let go');
  check(lib.attach() === 5 && lib.attach() === 5 && lib.counts.cast === 5, 'the recordings are counted once, however often the packs are read');
  // The guide's list read before the packs are known is not left empty for good.
  const g = new GuideVoice({ library: { has: () => false }, url: 'none' });
  g.all = [{ id: 1, text: 'Over here.' }, { id: 2, text: 'This way.' }];
  g._known();
  const before = g.available;
  g.library = { has: (n) => n === 'vg_2' };
  check(!before && g.available && g.phrases.length === 1, 'the guide\'s phrases read before the sounds are known are found once they are');
  // A cheap way that has used up its lone words never hides a way that works.
  const idx = makeIndex([{ name: 'x', key: 'x', k: 'word' }, { name: 'y', key: 'y', k: 'word' }, { name: 'z', key: 'z', k: 'word' }, { name: 'w', key: 'w', k: 'word' },
    { name: 'u', key: 'u', k: 'word' }, { name: 'xy', key: 'x y', k: 'line' }, { name: 'xyzwu', key: 'x y z w u q', k: 'line' }]);
  const cov = coverSentence(['x', 'y', 'z', 'w', 'u'], idx);
  check(cov && cov.length === 4 && cov[0].name === 'xy', 'a sentence is covered whenever it can be within the limit of lone words');
}
// Every run of words between two numbers, in every line heard, is one recording: a
// line is joined only at its numbers, and every sentence ends on a recording said as an ending.
{
  const heard = [];
  if (existsSync(capFile)) for (const c of JSON.parse(readFileSync(capFile, 'utf8'))) heard.push(c.text);
  const evFile = join(root, 'tests', 'voice-event-lines.json');
  if (existsSync(evFile)) for (const l of JSON.parse(readFileSync(evFile, 'utf8'))) heard.push(l);
  const kindOf = new Map(bellaEntries.map((e) => [e.name, e]));
  let ends = 0; let said = 0; const joins = new Set();
  for (const l of heard) {
    const p = plan(l, index);
    if (!p) continue;
    said += 1;
    for (const s of p) {
      if (!kindOf.get(s[s.length - 1].name).end) ends += 1;
      for (let i = 0; i + 1 < s.length; i++) {
        const a = kindOf.get(s[i].name); const b = kindOf.get(s[i + 1].name);
        if (a.k !== 'num' && b.k !== 'num' && (a.key.split(' ').length === 1 || b.key.split(' ').length === 1)) joins.add(`${a.key} | ${b.key}`);
      }
    }
  }
  check(existsSync(evFile) && said === heard.length && heard.length > 2500, `all ${heard.length} lines heard in runs and said by events can be said by the recordings`);
  check(ends === 0, `every sentence of them ends on a recording said as an ending (${ends} do not)`);
  check(joins.size === 0, `none of them joins a single word to its neighbour without a number between ${JSON.stringify([...joins].slice(0, 4))}`);
}

// ------------------------------------------------------------------ in the browser
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const requests = [];
page.on('request', (r) => requests.push(r.url()));
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 120000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');
check(!requests.some((u) => !u.startsWith(base) && !/github/.test(u)), 'nothing is fetched from any other site for the voices: ' + JSON.stringify(requests.filter((u) => !u.startsWith(base)).slice(0, 3)));
const r = await page.evaluate(async () => {
  const sp = window.__el.speech; const g = window.__el.game; const a = window.__el.audio;
  const v = sp.bella;
  const out = { ready: v.ready, counts: v.library.counts, decodedAtLoad: v.library.kept.size + v.library.pending.size };
  // Which pieces a line is played from, and when each starts.
  const starts = [];
  const real = a.ctx.createBufferSource.bind(a.ctx);
  a.ctx.createBufferSource = () => { const s = real(); const st = s.start.bind(s); s.start = (when, ...x) => { starts.push({ when, len: s.buffer ? s.buffer.duration : 0 }); return st(when, ...x); }; return s; };
  // A run: the speech is Bella's.
  const realInRun = sp.inRun; let running = true; sp.inRun = () => running;
  const dev = sp.deviceLines; const bel = sp.bellaLines;
  sp.speak('Wave 3, 5 left. Clock 87 seconds.');
  for (let i = 0; i < 60 && !starts.length; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 100));
  out.wave = { bella: sp.bellaLines - bel, device: sp.deviceLines - dev, pieces: starts.length };
  // Back to back, no overlap, a gap only where the text pauses.
  const first = starts.slice(0, plan0(v, 'Wave 3, 5 left.'));
  out.inOrder = first.every((s, i) => i === 0 || s.when >= first[i - 1].when + first[i - 1].len - 1e-6);
  function plan0(vv, t) { return vv._plan(t)[0].length; }
  sp.stop();
  // A line with a word that has no recording: the device's voice.
  const d2 = sp.deviceLines;
  sp.speak('Press the zorblax key.');
  await new Promise((r) => setTimeout(r, 100));
  out.unknown = sp.deviceLines - d2;
  sp.stop();
  // Outside a run: the device's voice.
  running = false;
  const d3 = sp.deviceLines; const b3 = sp.bellaLines;
  sp.speak('Level 3.');
  await new Promise((r) => setTimeout(r, 100));
  out.menu = { device: sp.deviceLines - d3, bella: sp.bellaLines - b3 };
  sp.stop();
  // The Speech setting Off (Braille only): Bella is silent too.
  running = true;
  const realMuted = sp.muted; sp.muted = () => true;
  starts.length = 0;
  sp.speak('Level 3.');
  await new Promise((r) => setTimeout(r, 200));
  out.muted = starts.length;
  sp.muted = realMuted;
  // A new line cuts the old off at once.
  sp.speak('Compass on. You are in a safe zone. Nothing to pick up nearby.');
  await new Promise((r) => setTimeout(r, 150));
  const live = v.playing.size;
  sp.speak('Level 4.');
  await new Promise((r) => setTimeout(r, 30));
  out.cut = { before: live, gen: v.gen };
  sp.stop();
  sp.inRun = realInRun;
  a.ctx.createBufferSource = real;
  // The guide and the characters, from the same packs.
  const C = await import('./js/modes/ultimate/cast.js');
  const { CastVoices } = await import('./js/voice.js');
  await C.loadCast();
  const cv = new CastVoices(v.library);
  const ln = C.castList()[0].lines.greeting[0];
  out.castHas = cv.has(ln);
  cv.peek(ln);
  for (let i = 0; i < 40 && !cv.peek(ln); i++) await new Promise((r) => setTimeout(r, 25));
  out.castBuf = !!cv.peek(ln);
  await v.guide.load();
  v.guide.prepare(6);
  for (let i = 0; i < 100 && v.guide.stock() < 3; i++) await new Promise((r) => setTimeout(r, 50));
  const c1 = v.guide.next(); const c2 = v.guide.next();
  out.guide = { available: v.guide.available, b1: !!c1.buffer, b2: !!c2.buffer, differ: c1.id !== c2.id };
  return out;
});
check(r.ready && r.counts.bella > 1000 && r.counts.guide >= 300 && r.counts.cast > 2000, 'the recordings are known once the sounds have loaded: ' + JSON.stringify(r.counts));
check(r.decodedAtLoad === 0, 'nothing is decoded ahead as the sounds load (it would hold up the game\'s own sounds)');
check(r.wave.bella === 1 && r.wave.device === 0 && r.wave.pieces >= 4, 'a line the game builds is said by joining recordings, nothing by the device: ' + JSON.stringify(r.wave));
check(r.inOrder, 'one after another, each starting as the one before ends');
check(r.unknown === 1, 'a line with no recording is the device voice\'s');
check(r.menu.device === 1 && r.menu.bella === 0, 'outside a run the device\'s voice speaks');
check(r.muted === 0, 'with Speech Off (Braille only) Bella is silent too');
check(r.cut.before >= 1, 'a new line cuts off whatever she is saying');
check(r.castHas && r.castBuf, 'a character\'s line is its recording, decoded in a moment');
check(r.guide.available && r.guide.b1 && r.guide.b2 && r.guide.differ, 'the guide\'s calls are her recordings, never the same twice running');
check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
