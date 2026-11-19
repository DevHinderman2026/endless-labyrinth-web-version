// Bella, the voice of a run, and the Find the Voice guide (web 6.0.0): js/bella.js,
// js/bella-words.js, js/bella-lexicon.js, js/bella-worker.js, js/speech.js and the
// shared js/data/guide_phrases.json. Run with the site served:
//   node tests/bella.mjs http://localhost:8765 [the Windows game's folder, for its event templates]
//
// The workspace has no Kokoro model and no internet, so nothing here hears Bella. The
// dictionary is checked against every word of the game's text, every event template
// and the guide's phrases (in Node); in Chromium the real worker is run with a
// stand-in ONNX Runtime (the numbers it is fed, the style row, the pads), and Bella
// and the speech are run with a stand-in model that answers fast, slowly, wrongly or
// not at all, to check every way back to the device's voice. How Bella sounds is for
// listening.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { LEXICON } from '../js/bella-lexicon.js';
import { toPhonemes, toTokens, VOCAB, numberWords, covers, lookup } from '../js/bella-words.js';

const base = process.argv[2] || 'http://localhost:8765';
const desktop = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Endless Labyrinth');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ the dictionary
const chars = new Set();
for (const p of Object.values(LEXICON)) for (const ch of p) chars.add(ch);
const notInVocab = [...chars].filter((ch) => VOCAB[ch] === undefined);
check(!notInVocab.length, `every phoneme in the dictionary is in Kokoro's table ${JSON.stringify(notInVocab)}`);
check(!Object.values(LEXICON).some((p) => /[gr]/.test(p)), "Misaki's ɡ and ɹ throughout, never the plain letters g and r");
check(Object.keys(LEXICON).length > 2500, `the dictionary has ${Object.keys(LEXICON).length} words`);
const FUNCTION = new Set('a am an and are as at be been but by can could does for from had has have he her him his if in is it its my nor of or per should some she such than that the their through to was we were will with would you you\'ll you\'re you\'ve your'.split(' '));
const flat = Object.entries(LEXICON).filter(([w, p]) => !FUNCTION.has(w) && !/[ˈˌ]/.test(p)).map(([w]) => w);
check(!flat.length, `every word but the small ones has a stress mark ${JSON.stringify(flat)}`);

// Words in the game's own text that are not words (code names, file names, web addresses).
const NOT_WORDS = new Set(['ai', 'alt', 'amb', 'api', 'com', 'devhinderman', 'enem', 'evt', 'faq', 'frag', 'https', 'id',
  'json', 'li', 'mailto', 'noopener', 'noreferrer', 'nvda', 'ogg', 'tr', 'url', 'www', 'ul', 'div', 'span', 'nav', 'ies', 'ves', 'en', 'es', 'fe', 'ch', 'ir', 'desc']);
const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const known = (w) => w.length === 1 || NOT_WORDS.has(w) || !!lookup(w);
function stringsOfJs(src) {
  const out = [];
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ').replace(/\\'/g, "'");
    if (/\s/.test(s.trim()) || /^[A-Z][a-z]+[.!?,]?$/.test(s)) out.push(s);
  }
  return out;
}
const jsFiles = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.js')) jsFiles.push(p); } };
walk(join(root, 'js', 'modes'));
jsFiles.push(join(root, 'js', 'game.js'), join(root, 'js', 'turning.js'));
const runWords = new Set();
for (const f of jsFiles) for (const s of stringsOfJs(readFileSync(f, 'utf8'))) for (const w of s.match(WORD) || []) runWords.add(w.toLowerCase());
const runMissing = [...runWords].filter((w) => !known(w)).sort();
check(!runMissing.length, `every word in the text of the game and its modes is in the dictionary (${runWords.size} words) ${JSON.stringify(runMissing)}`);

// Every event template and published event: every word of every text in them.
const strs = (o, out) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((v) => strs(v, out)); else if (o && typeof o === 'object') Object.values(o).forEach((v) => strs(v, out)); return out; };
const eventFiles = [];
for (const d of [join(desktop, 'Developer Tools', 'templates'), join(desktop, 'events'), join(root, 'events')]) {
  if (existsSync(d)) for (const n of readdirSync(d)) if (n.endsWith('.json')) eventFiles.push(join(d, n));
}
const evWords = new Set();
for (const f of eventFiles) {
  for (const s of strs(JSON.parse(readFileSync(f, 'utf8')), [])) {
    // Not text: file names, dates, ids (template-call-of-fate) and signatures.
    if (/^[\w-]+\.(ogg|mp3|wav)$/i.test(s) || /^\d{4}-\d\d-\d\dT/.test(s) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) || /^[A-Za-z0-9+/=_-]{24,}$/.test(s)) continue;
    for (const w of s.match(WORD) || []) evWords.add(w.toLowerCase());
  }
}
const evMissing = [...evWords].filter((w) => !known(w)).sort();
if (eventFiles.length) {
  check(eventFiles.length >= 100 && !evMissing.length, `every word of all ${eventFiles.length} event templates and events is in the dictionary (${evWords.size} words) ${JSON.stringify(evMissing)}`);
} else console.log('(The Windows game\'s folder was not found: the event templates are not checked. Give it as the second argument.)');

// Lines the game builds itself, numbers, scores and times.
let numbersOk = true;
for (let n = 0; n <= 20000; n++) if (!covers(`${n}`)) { numbersOk = false; console.log('  not said: ' + n); break; }
check(numbersOk, 'every number from 0 to 20,000 can be said');
check(covers('1,250,300') && covers('3.5') && covers('50%') && covers('-4') && covers('21st') && covers('3rd'), 'thousands, decimals, percent, minus and ordinals');
check(toPhonemes('-4').phonemes === 'mˈInəs fˈɔɹ', 'a minus sign: ' + toPhonemes('-4').phonemes);
check(numberWords(127).join(' ') === 'one hundred twenty seven' && numberWords(1000000).join(' ') === 'one million', 'number words');
const built = [
  'Ring once.', 'Ring 3 times.', 'Ring 17 times.', 'Find 2 real bells.', 'Level 12.', '45 seconds remaining.',
  '1 second left.', '2 minutes left.', 'Wave 3, 5 left. Clock 87 seconds.', 'Wave break, 4 seconds. Clock 12 seconds.',
  'Floor 4 of 9.', 'Health low. 23.', 'Tower 2 complete. 3 bonus items.', 'Compass ready in 5 seconds.',
  '80 health. 1,240 points. 12 shots. 3 items. Facing north.', 'Compass on.', 'Low air.',
  // Web 6.0.0: Find the Voice, the safe zones' gifts, the world's mercy.
  'Find the Voice. Level 1.', 'Level 7.', 'Caught. 2 lives left.', 'Caught. 1 life left.',
  'Level 3. 2 of 5 found. 1 life left. Facing north-north-east.', '4 of 5 found.', 'All 5 found.', '12 more seconds.',
  "You've just received 25 shots of ammo.", "You've just received 40 health.", "You've just received 3 tower items.",
  "You've just received 12 shots of ammo and 30 health.", "You've just received 12 shots of ammo, 30 health and 1 tower item.",
  "You've just received 2 more minutes in this world, and 3 and a half minutes on the clock.",
  "You've just received a treasure chest. Listen for it nearby.", 'The world shows you mercy. 35 more seconds.',
  'Compass ready in 1 second.', '45 more seconds in this world.',
  ...['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
    'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'].map((w) => `Facing ${w}.`),
];
const notBuilt = built.filter((l) => !covers(l));
check(!notBuilt.length, `lines the game builds itself can all be said ${JSON.stringify(notBuilt)}`);
check(toPhonemes('Ring 3 times.').phonemes === 'ɹˈɪŋ θɹˈi tˈImz.', 'Call of Fate: Ring three times');
check(toPhonemes("The guard's torch.").phonemes === 'ðə ɡˈɑɹdz tˈɔɹʧ.', "a word's 's by rule");
check(toPhonemes('the end').phonemes === 'ði ˈɛnd' && toPhonemes('to east').phonemes === 'tʊ ˈist', '"the" and "to" before a vowel');
check(toPhonemes('Use the laser.').phonemes.startsWith('jˈuz'), '"use" as a verb');
const odd = toPhonemes('Press the zorblax key.');
check(odd.phonemes === null && odd.missing.join() === 'zorblax', 'a word not in the dictionary: no phonemes, and the word is named');
check(toPhonemes('Score: 5 / 10').phonemes === null, 'a sign it cannot say (/): not Bella\'s');
check(toPhonemes('Press NVDA.').phonemes === 'pɹˈɛs ˈɛn vˈi dˈi ˈA.', 'capitals not in the dictionary are spelled out');

// The guide's phrases: the shared file, made from the dictionary.
const guide = JSON.parse(readFileSync(join(root, 'js', 'data', 'guide_phrases.json'), 'utf8'));
check(guide.phrases.length >= 300, `the guide has ${guide.phrases.length} phrases`);
const guideOff = guide.phrases.filter((p) => toPhonemes(p.text).phonemes !== p.phonemes);
check(!guideOff.length, `every phrase's phonemes are its words from the dictionary ${JSON.stringify(guideOff.slice(0, 3))}`);
const winGuide = join(desktop, 'Dev Builds', 'guide_phrases.json');
if (existsSync(winGuide)) check(readFileSync(winGuide, 'utf8') === readFileSync(join(root, 'js', 'data', 'guide_phrases.json'), 'utf8'), 'the Windows game\'s Dev Builds/guide_phrases.json is the same file');
check(guide.phrases.every((p) => toTokens(p.phonemes).length < 80), 'every phrase is short');

// No GPL: nothing imports kokoro-js, a phonemizer or eSpeak.
const mine = ['bella.js', 'bella-words.js', 'bella-worker.js', 'bella-lexicon.js', 'speech.js'].map((n) => readFileSync(join(root, 'js', n), 'utf8')).join('\n');
check(!/import[^;]*(kokoro-js|phonemize|espeak)|importScripts\([^)]*(kokoro|espeak|phonemiz)/i.test(mine), 'no kokoro-js, no phonemizer, no eSpeak');
check(/onnxruntime-web@\$\{ORT_VERSION\}\/dist\//.test(mine) && /ORT_VERSION = '1\.20\.1'/.test(mine) && /ort\.wasm\.min\.js/.test(mine) && /numThreads = threads/.test(mine) && /self\.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'/.test(mine), 'ONNX Runtime Web 1.20.1 from jsDelivr, wasm; several threads only on an isolated page, else one');
check(/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/main\//.test(mine) && /onnx\/model_quantized\.onnx/.test(mine) && /voices\/af_bella\.bin/.test(mine) && /voices\/af_heart\.bin/.test(mine), 'the model and the two voices from onnx-community');

// ------------------------------------------------------------------ in the browser
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/credits.html');
check(await page.evaluate(() => /Kokoro/.test(document.body.textContent) && /Bella/.test(document.body.textContent) && /Heart/.test(document.body.textContent) && /ONNX Runtime/.test(document.body.textContent)), 'the Credits page credits Kokoro, Bella, Heart and ONNX Runtime');

// The real worker, with a stand-in ONNX Runtime and the files from blob addresses.
const worker = await page.evaluate(async (base) => {
  const fake = `
    self.fed = [];
    self.ort = { env: { wasm: {} },
      Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } },
      InferenceSession: { create: async (bytes, opts) => ({
        inputNames: ['input_ids', 'style', 'speed'], outputNames: ['waveform'],
        run: async (f) => {
          const ids = Array.from(f.input_ids.data, Number);
          self.fed.push({ ids, dims: f.input_ids.dims, type: f.input_ids.type, style0: f.style.data[0], styleLen: f.style.data.length, speed: f.speed.data[0] });
          self.postMessage({ type: 'fed', fed: self.fed[self.fed.length - 1], modelBytes: bytes.length });
          await new Promise((r) => setTimeout(r, 100));   // a model takes its time
          const out = new Float32Array(ids.length * 1000);
          for (let i = 0; i < out.length; i++) out[i] = 0.3 * Math.sin(i / 7);
          return { waveform: { data: out } };
        } }) } };
    importScripts('${base}/js/bella-worker.js');`;
  const w = new Worker(URL.createObjectURL(new Blob([fake], { type: 'text/javascript' })));
  const style = new Float32Array(510 * 256);
  for (let r = 0; r < 510; r++) style.fill(r, r * 256, (r + 1) * 256);
  const voice = URL.createObjectURL(new Blob([style.buffer]));
  const model = URL.createObjectURL(new Blob([new Uint8Array(1000)]));
  const got = [];
  w.onmessage = (e) => got.push(e.data);
  w.postMessage({ type: 'init', ortUrl: 'about:blank', wasmPaths: 'https://example.invalid/', modelUrl: model, voices: { af_bella: voice }, testIds: [123, 86] });
  const wait = async (f, ms = 5000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 20)); return f(); };
  await wait(() => got.some((m) => m.type === 'ready' || m.type === 'failed'));
  const ready = got.find((m) => m.type === 'ready' || m.type === 'failed');
  w.postMessage({ type: 'synth', id: 7, ids: [50, 156, 86, 54], voice: 'af_bella', speed: 1, now: false });
  w.postMessage({ type: 'synth', id: 8, ids: [44, 156, 51], voice: 'af_bella', speed: 1, now: true });
  w.postMessage({ type: 'synth', id: 9, ids: [44], voice: 'af_bella', speed: 1, now: false });
  w.postMessage({ type: 'cancel', ids: [9] });
  await wait(() => got.filter((m) => m.type === 'audio').length >= 2 && got.some((m) => m.type === 'dropped'));
  // A safe zone character's voice, loaded on request, then a line in it from phonemes.
  w.postMessage({ type: 'voice', name: 'bf_emma', url: voice });
  w.postMessage({ type: 'voice', name: 'bm_nope', url: URL.createObjectURL(new Blob([new Uint8Array(10)])) });
  await wait(() => got.filter((m) => m.type === 'voice').length >= 2);
  w.postMessage({ type: 'synth', id: 11, ids: [50, 156, 86], voice: 'bf_emma', speed: 1, now: true });
  w.postMessage({ type: 'synth', id: 12, ids: [50, 156, 86], voice: 'bm_nope', speed: 1, now: true });
  await wait(() => got.some((m) => m.id === 11) && got.some((m) => m.id === 12));
  const voiceAnswers = got.filter((m) => m.type === 'voice').map((m) => [m.name, m.ok]);
  const line11 = got.find((m) => m.id === 11); const line12 = got.find((m) => m.id === 12);
  w.terminate();
  return { voiceAnswers, line11: line11 && line11.type, line12: line12 && line12.type, ready, fed: got.filter((m) => m.type === 'fed').map((m) => m.fed), audio: got.filter((m) => m.type === 'audio').map((m) => ({ id: m.id, n: m.samples.length })), dropped: got.filter((m) => m.type === 'dropped').map((m) => m.id) };
}, base);
check(worker.ready && worker.ready.type === 'ready', 'the worker loads the files, makes its test word and says it is ready ' + JSON.stringify(worker.ready));
const f1 = worker.fed.find((f) => f.ids.length === 6);
check(f1 && f1.type === 'int64' && f1.dims.join() === '1,6' && f1.ids.join() === '0,50,156,86,54,0', 'the model gets input_ids as int64 [1, n + 2], a pad at each end ' + JSON.stringify(f1));
check(f1 && f1.style0 === 4 && f1.styleLen === 256 && f1.speed === 1, 'the style is the voice\'s row for that many phonemes (4), 256 numbers; speed 1');
check(worker.audio.filter((a) => a.id === 7 || a.id === 8).length === 2 && worker.audio.every((a) => a.n > 0), 'the sound comes back for each line wanted');
check(JSON.stringify(worker.voiceAnswers.slice().sort()) === '[["bf_emma",true],["bm_nope",false]]', 'a character\'s voice loads on request ({ type: voice }) and a broken one says so ' + JSON.stringify(worker.voiceAnswers));
check(worker.line11 === 'audio' && worker.line12 === 'error', 'a line from phonemes in a loaded voice is made; in a voice not loaded it is refused');
check(worker.dropped.includes(9) && worker.fed.length === 4, 'a line no longer wanted is dropped before it starts; lines are made one at a time');

// Bella and the speech with a stand-in model. opts: delay (ms), rtf (how long it
// reports it took against the sound's length), fail.
await page.evaluate(async (base) => {
  const { Bella, KokoroEngine, GuideVoice } = await import(base + '/js/bella.js');
  const { Speech } = await import(base + '/js/speech.js');
  const { AudioEngine } = await import(base + '/js/audio.js');
  window.T = { Bella, KokoroEngine, GuideVoice, Speech, AudioEngine };
  window.said = [];
  const synth = { speak(u) { window.said.push(u.text); setTimeout(() => u.onend && u.onend(), 30); }, cancel() {}, getVoices() { return []; } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.fakeWorker = (opts = {}) => () => {
    const w = { onmessage: null, onerror: null, terminated: false, synths: [] };
    w.postMessage = (m) => {
      if (m.type === 'init') {
        setTimeout(() => w.onmessage({ data: opts.fail ? { type: 'failed', stage: 'model', error: 'offline' } : { type: 'ready', inputs: ['input_ids', 'style', 'speed'] } }), 10);
      } else if (m.type === 'voice') {
        setTimeout(() => w.onmessage({ data: { type: 'voice', name: m.name, ok: m.name !== 'bm_gone', url: m.url } }), 5);
      } else if (m.type === 'synth') {
        w.synths.push(m);
        const n = m.ids.length * 1200;
        const samples = new Float32Array(n);
        for (let i = 0; i < n; i++) samples[i] = 0.4 * Math.sin(i * 2 * Math.PI * 200 / 24000);
        const audioMs = n / 24;
        setTimeout(() => w.onmessage({ data: { type: 'audio', id: m.id, samples, ms: opts.rtf ? audioMs * opts.rtf : 10, waited: 0 } }), opts.delay || 5);
      }
    };
    w.terminate = () => { w.terminated = true; };
    window.lastWorker = w;
    return w;
  };
  window.make = async (opts = {}) => {
    if (window.speech) window.speech.stop();
    const audio = new AudioEngine();
    await audio.ctx.resume();
    const engine = new KokoroEngine({ makeWorker: window.fakeWorker(opts) });
    const bella = new Bella({ audio, engine });
    window.run = true;
    window.muted = false;
    const speech = new Speech({ bella, inRun: () => window.run, muted: () => window.muted });
    bella.start();
    for (let i = 0; i < 100 && !engine.ready && engine.state !== 'failed'; i++) await new Promise((r) => setTimeout(r, 10));
    window.said = [];
    Object.assign(window, { audio, engine, bella, speech });
    return true;
  };
}, base);

const waitFor = (f, ms = 5000) => page.waitForFunction(f, null, { timeout: ms }).then(() => true, () => false);

await page.evaluate(() => window.make());
check(await page.evaluate(() => window.engine.ready && window.bella.ready), 'with the model ready, Bella is ready');
check(await page.evaluate(() => window.bella.prepQueue.length > 0 || window.bella.kept.size > 0), 'the common lines are being made ahead as soon as she is ready');
await waitFor(() => window.bella.prepQueue.length === 0 && !window.bella.prepping, 30000);
const prepared = await page.evaluate(() => [...window.bella.kept.values()].filter((e) => e.pinned && e.buffer).length);
check(prepared >= 40, `common lines made ahead and kept (${prepared})`);

await page.evaluate(() => { window.said = []; window.speech.speak('Level 3. You reached wave 4.'); });
check(await waitFor(() => window.bella.playing.size > 0), 'a line of the run is played by Bella');
const during = await page.evaluate(() => ({ said: [...window.said], bella: window.speech.bellaLines }));
check(during.said.length === 0 && during.bella === 1, 'and not by the device voice ' + JSON.stringify(during));
check(await waitFor(() => !window.speech.speaking, 8000), 'the line ends and the speech moves on');
check(await page.evaluate(() => window.speech.completed === 'Level 3. You reached wave 4.'), 'said to its end');

await page.evaluate(() => { window.said = []; window.speech.speak('The zorblax is near.'); });
check(await waitFor(() => window.said.includes('The zorblax is near.')), 'a line with a word not in the dictionary is said by the device voice');
check(await page.evaluate(() => window.bella.missingWords.has('zorblax')), 'and the word is noted');

await page.evaluate(() => { window.run = false; window.said = []; window.speech.speak('Main Menu. Standard mode.'); });
check(await waitFor(() => window.said.join(' ').includes('Main Menu. Standard mode.')), 'outside a run (menus, Game Over) the device voice speaks');
await page.evaluate(() => { window.run = true; window.said = []; window.speech.speak('Game Over. You reached level 4.', { device: true }); });
check(await waitFor(() => window.said.length > 0), 'speak(text, { device: true }) keeps a line on the device voice in a run');
await waitFor(() => !window.speech.speaking, 8000);

await page.evaluate(() => { window.muted = true; window.said = []; window.speech.speak('Level 5.'); });
await sleep(300);
check(await page.evaluate(() => window.said.length === 0 && window.bella.playing.size === 0), 'with Speech off, neither Bella nor the device voice speaks');
await page.evaluate(() => { window.muted = false; });
await waitFor(() => !window.speech.speaking, 8000);

await page.evaluate(() => { window.speech.speak('Level 6. Wave 7. Floor 8 of 9.'); });
await waitFor(() => window.bella.playing.size > 0);
await page.evaluate(() => { window.speech.speak('Level 7.'); });
await sleep(150);
check(await page.evaluate(() => window.bella.playing.size <= 1 && window.speech.current === 'Level 7.'), 'a new line cuts off whatever Bella was saying');
await waitFor(() => !window.speech.speaking, 8000);

const echo = await page.evaluate(async () => {
  const a = window.audio;
  const ir = a.ctx.createBuffer(2, 4410, 44100);
  ir.getChannelData(0)[100] = 0.5; ir.getChannelData(1)[200] = 0.5;
  a.irBuffers.set('lab#0', ir);
  a.room = 'lab';
  const r1 = window.bella._room();
  window.speech.speak('Level 8.');
  await new Promise((r) => setTimeout(r, 200));
  const convs = window.bella.convs.size;
  a.room = null;
  return { key: r1 && r1.key, convs };
});
check(echo.key === 'lab' && echo.convs === 1, 'Bella is heard with the echo of the room the player is in ' + JSON.stringify(echo));
const spatial = await page.evaluate(() => {
  const a = window.audio;
  a.spatialOn();
  const ir = a.ctx.createBuffer(2, 4410, 44100);
  a.irBuffers.set('cave#0', ir);
  a.setAreaRooms([{ id: 'a1', room: 'cave', stretch: 1.5 }]);
  a.listenerMix = { a1: 1 };
  a.setMuffle(true, 0.01);
  const r = window.bella._room();
  const out = window.bella._out();
  const ok = { key: r && r.key, bypass: out === a.out && out !== a.worldIn };
  a.spatialOff({ now: true });
  return ok;
});
check(spatial.key === 'cave@1.5' && spatial.bypass, 'in the 3D world: the echo of the area the player stands in, past the world\'s muffle and fade ' + JSON.stringify(spatial));
await waitFor(() => !window.speech.speaking, 8000);

const lvl = await page.evaluate(async () => {
  const before = window.lastWorker.synths.length;
  window.speech.rateLevel = 8;
  window.speech.speak('Floor 9 of 11.');
  await new Promise((r) => setTimeout(r, 200));
  const m = window.lastWorker.synths.slice(before);
  const e = [...window.bella.kept.values()].find((x) => x.buffer);
  const d = e.buffer.getChannelData(0);
  let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return { speeds: m.map((x) => x.speed), rms: Math.sqrt(s / d.length) };
});
check(lvl.speeds.length && lvl.speeds.every((s) => s === 1), 'one fixed speed, whatever the Speech Rate setting');
check(Math.abs(lvl.rms - 0.11 * 1.05) < 0.01, `about 5% over the usual speech level (${lvl.rms.toFixed(3)})`);
await page.evaluate(() => { window.speech.rateLevel = 3; });
await waitFor(() => !window.speech.speaking, 8000);

await page.evaluate(() => window.make({ fail: true }));
await page.evaluate(() => { window.said = []; window.speech.speak('Level 3.'); });
check(await waitFor(() => window.said.includes('Level 3.')), 'Bella not downloaded or failed: the device voice says the line');
check(await page.evaluate(() => window.engine.state === 'failed'), 'and the engine says it failed (nothing is spoken about it)');

await page.evaluate(() => window.make({ delay: 2500 }));
// (A line late only because one being made ahead was with the worker is not counted
// against the device: so nothing is being made ahead when these three are asked for.)
await page.evaluate(() => { window.bella.prepQueue = []; });
await waitFor(() => !window.bella.prepping && !window.engine.aheadBusy(), 8000);
await page.evaluate(() => { window.said = []; window.speech.speak('Floor 2 of 9.'); });
check(await waitFor(() => window.said.includes('Floor 2 of 9.'), 4000), 'a line not made in time is said by the device voice');
await page.evaluate(() => { window.speech.speak('Floor 3 of 9.'); });
await waitFor(() => window.said.includes('Floor 3 of 9.'), 4000);
await page.evaluate(() => { window.speech.speak('Floor 4 of 9.'); });
await waitFor(() => window.said.includes('Floor 4 of 9.'), 4000);
check(await page.evaluate(() => !window.bella.struggling && window.bella.misses === 3), 'three lines in a row too late: not given up yet (6.0.1: it was too quick to)');
for (const n of [5, 6, 7]) {
  await page.evaluate((k) => { window.speech.speak(`Floor ${k} of 9.`); }, n);
  await page.waitForFunction((k) => window.said.includes(`Floor ${k} of 9.`), n, { timeout: 4000 }).catch(() => {});
}
check(await page.evaluate(() => window.bella.struggling && !window.bella.ready), 'six lines in a row too late: Bella gives way to the device voice for a while (' + await page.evaluate(() => window.bella.why) + ')');
await page.evaluate(() => { window.said = []; window.speech.speak('Level 3.'); });
check(await waitFor(() => window.said.includes('Level 3.'), 1000), 'meanwhile the device voice speaks at once');
// After a rest she tries again, with the count started afresh.
await page.evaluate(() => window.make({ delay: 2500 }));
await page.evaluate(() => { window.bella.restMs = 300; window.bella.prepQueue = []; window.bella._giveUp('a test'); });
check(await page.evaluate(() => window.bella.struggling), 'given up (for the rest test)');
check(await waitFor(() => !window.bella.struggling && window.bella.misses === 0 && window.bella.rests === 1, 3000), 'after the rest Bella tries her own voice again');

// A line late behind one being made ahead: said by the device voice, never counted.
await page.evaluate(() => window.make({ delay: 2500 }));
await page.evaluate(() => { window.said = []; window.bella.misses = 0; window.speech.speak('Floor 2 of 7.'); });
await waitFor(() => window.said.includes('Floor 2 of 7.'), 4000);
check(await page.evaluate(() => window.bella.misses === 0 && !window.bella.struggling), 'a line that waited behind lines being made ahead is said by the device voice and not held against the device');

await page.evaluate(() => window.make({ rtf: 1.6 }));
await page.evaluate(async () => {
  window.bella.prepQueue = [];
  for (const t of ['Floor 5 of 11.', 'Floor 6 of 11.', 'Floor 7 of 11.', 'Floor 8 of 11.']) {
    window.speech.speak(t);
    await new Promise((r) => setTimeout(r, 400));
  }
});
check(await page.evaluate(() => !window.bella.struggling), 'a device somewhat slower than speech is not given up on (lines are made ahead)');
await page.evaluate(() => window.make({ rtf: 3.2 }));
await page.evaluate(async () => {
  window.bella.prepQueue = [];
  for (const t of ['Floor 5 of 12.', 'Floor 6 of 12.', 'Floor 7 of 12.', 'Floor 8 of 12.']) {
    window.speech.speak(t);
    await new Promise((r) => setTimeout(r, 400));
  }
});
check(await page.evaluate(() => window.bella.struggling), 'a device that makes the voice slower than real time is noticed (' + await page.evaluate(() => window.bella.why) + ')');

await page.evaluate(() => window.make());
const capped = await page.evaluate(async () => {
  window.bella.prepQueue = [];
  const { KEEP_BYTES } = await import(location.origin + '/js/bella.js');
  for (let i = 0; i < 400; i++) window.bella._keep('lˈɛvᵊl ' + i, { buffer: {}, bytes: 200000, pinned: false });
  return { bytes: window.bella.keptBytes, max: KEEP_BYTES };
});
check(capped.bytes <= capped.max, `lines kept stay under the limit (${(capped.bytes / 1e6).toFixed(1)} of ${(capped.max / 1e6).toFixed(0)} MB)`);

const cast = await page.evaluate(async () => {
  const e = window.engine;
  const before = e.voiceLoaded('bf_emma');
  const ok = await e.loadVoice('bf_emma');
  const bad = await e.loadVoice('bm_gone');
  const job = e.synth('ɡˈʊd mˈɔːnɪŋ.', 'bf_emma', { now: true });
  const r = await job.promise;
  return { before, ok, bad, after: e.voiceLoaded('bf_emma'), heart: e.voiceLoaded('af_heart'), made: !!(r && r.samples), voice: window.lastWorker.synths[window.lastWorker.synths.length - 1].voice };
});
check(!cast.before && cast.ok && !cast.bad && cast.after && cast.heart, 'KokoroEngine.loadVoice / voiceLoaded for the safe zone characters (js/modes/ultimate/cast.js) ' + JSON.stringify(cast));
check(cast.made && cast.voice === 'bf_emma', 'a character\'s line is made from its own phonemes (British too) in its own voice');
const castOff = await page.evaluate(async () => { const e = new window.T.KokoroEngine({ makeWorker: window.fakeWorker({ fail: true }) }); e.start(); await new Promise((r) => setTimeout(r, 50)); return await e.loadVoice('bf_emma'); });
check(castOff === false, 'with the engine failed, a character\'s voice is refused at once (the device voice speaks)');

const real = await page.evaluate(async () => {
  const e = new window.T.KokoroEngine();
  e.start();
  for (let i = 0; i < 300 && e.state === 'loading'; i++) await new Promise((r) => setTimeout(r, 50));
  return { state: e.state, error: e.error };
});
check(real.state === 'failed', 'the real worker with no internet: Bella is not used, nothing breaks ' + JSON.stringify(real));

await page.evaluate(() => window.make());
const g = await page.evaluate(async () => {
  window.bella.prepQueue = [];
  const guide = window.bella.guide;
  await guide.load();
  const total = guide.phrases.length;
  guide.prepare(6);
  for (let i = 0; i < 200 && guide.ready.size < 6; i++) await new Promise((r) => setTimeout(r, 20));
  const readyNow = guide.ready.size;
  const got = [];
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 100 && guide.ready.size === 0; j++) await new Promise((r) => setTimeout(r, 10));
    const p = guide.next();
    got.push({ id: p.id, text: p.text, ch: p.buffer && p.buffer.numberOfChannels, rate: p.buffer && p.buffer.sampleRate });
  }
  for (let j = 0; j < 100 && guide.ready.size === 0; j++) await new Promise((r) => setTimeout(r, 10));
  const p = guide.next();
  const name = guide.install(window.audio, 'ftv_guide_call', p);
  const v = name ? window.audio.play(name, {}) : null;
  const playing = !!v;
  if (v) v.stop();
  const most = guide.ready.size + guide.making.size;
  guide.release();
  return { total, readyNow, got, playing, most, after: guide.ready.size, voice: window.lastWorker.synths.filter((s) => s.voice === 'af_heart').length };
});
check(g.total >= 300 && g.readyNow === 6, `the guide keeps six of her ${g.total} phrases ready, not all of them`);
check(g.got.every((p) => p.ch === 1 && p.rate === 24000), 'each phrase is a one-channel AudioBuffer at 24000 a second');
check(g.got.every((p, i) => !g.got.slice(Math.max(0, i - 6), i).some((q) => q.id === p.id)), 'a phrase does not come back within the next six');
check(g.voice >= 12, 'her phrases are made in Heart\'s voice (af_heart)');
check(g.playing, 'install puts a phrase in the sound engine, to be played and placed like any sound');
check(g.most <= 6 && g.after === 0, 'never more than asked for, and release lets them all go');
const gNot = await page.evaluate(async () => {
  await window.make({ fail: true });
  const guide = window.bella.guide;
  await guide.load();
  guide.prepare(6);
  const p = guide.next();
  return { available: guide.available, buffer: p.buffer, text: p.text };
});
check(!gNot.available && gNot.buffer === null && !!gNot.text, 'Heart not available: next() still gives a phrase, with no sound, for the device voice and a beacon');

check(!errors.length, 'no page errors ' + JSON.stringify(errors.slice(0, 3)));
await browser.close();
console.log(`Dictionary: ${Object.keys(LEXICON).length} words; game text ${runWords.size} words, ${runMissing.length} missing; events ${evWords.size} words, ${evMissing.length} missing; guide ${guide.phrases.length} phrases.`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
