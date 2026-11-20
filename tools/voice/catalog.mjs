// The list of the game's recordings (web 6.1.0 / Windows 4.0.0): every piece of text
// the game says during a run, each to be recorded once. Run in Claude's workspace
// (Russell does not run it):
//
//   node tools/voice/catalog.mjs <web repo> <Windows repo> <out.json>
//
// It writes one list of recordings, each { name, voice, key, end, kind, text,
// phonemes, from }:
//
// Bella (af_bella), the game's voice during a run:
//   - 'line': the text of the game's own code that is said during a run: every
//     sentence of a quoted string, and every fixed piece of a line the code builds
//     (`Wave ${n}, ${left} left.` gives "Wave" and "left."), in the files of the
//     modes, the compass and the events engine; the in-run text of every event
//     template and published event (their story lines, stage names, item names);
//     the whole lines said most often, with their numbers in (EXPANSIONS); and the
//     phrases between the numbers of every line the game has been heard to say
//     (tests/voice-capture.json, tests/voice-event-lines.json) and of the compass's
//     sentences, so a line is joined only at its numbers: "The safe zone is", 11,
//     "steps away, starting east,", 60, "degrees to your right."
//   - 'num': the numbers 0 to 99 and "one hundred" to "nine hundred", "thousand",
//     "million", "point", "percent", "minus", each said within a sentence and as its
//     end.
//   - 'word': each word of all of the above on its own, for joining a few words the
//     game puts together in a way no phrase covers (at most three in a sentence:
//     js/voice-text.js).
// The Find the Voice guide (Heart, af_heart): every phrase of js/data/guide_phrases.json.
// The safe zone characters: every line of js/data/story-lines.json, in the
// character's own voice (js/data/safe-zone-cast.json).
//
// Text that is said only outside a run (menus, help, settings, the Events menu,
// event descriptions, Game Over and the final score) is the device voice's and is
// not recorded: help files are not read, and strings of the menus are left out by
// what they say (MENU_TEXT).

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toPhonemes, numberWords, toTokens, MAX_TOKENS } from '../../js/bella-words.js';
import { sentencesOf, wordsOfSentence, keyOf } from '../../js/voice-text.js';

const [web, win, outFile] = process.argv.slice(2);
if (!web || !win || !outFile) { console.error('usage: catalog.mjs <web> <windows> <out.json>'); process.exit(2); }

// ------------------------------------------------------------------ reading the code
// Every quoted string and every fixed piece of a template literal, with the line it
// is on. Comments and regular expressions are skipped.
export function textsOfJs(src) {
  const out = [];
  let i = 0; let line = 1;
  const n = src.length;
  let lastSig = '';
  let lastBefore = '';
  const regexCan = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || /\b(return|typeof|case|of|in)$/.test(lastSig);
  function readTemplate() {
    // at the opening backtick
    i += 1;
    let buf = ''; const startLine = line; const pieces = [];
    while (i < n) {
      const c = src[i];
      if (c === '\\') { buf += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
      if (c === '`') { i += 1; pieces.push(buf); break; }
      if (c === '$' && src[i + 1] === '{') {
        pieces.push(buf); buf = '';
        i += 2;
        const exprAt = i;
        let depth = 1;
        while (i < n && depth > 0) {
          const d = src[i];
          if (d === '\n') line += 1;
          if (d === '{') depth += 1;
          else if (d === '}') { depth -= 1; if (depth === 0) { i += 1; break; } }
          else if (d === "'" || d === '"') { readQuoted(d, true); continue; }
          else if (d === '`') { readTemplate(); continue; }
          i += 1;
        }
        pieces.push({ slot: src.slice(exprAt, i - 1) });   // a slot, with its code
        continue;
      }
      if (c === '\n') line += 1;
      buf += c; i += 1;
    }
    out.push({ kind: 'template', pieces, line: startLine });
  }
  function readQuoted(q, inner = false) {
    i += 1;
    let buf = ''; const startLine = line;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { buf += src[i + 1]; i += 2; continue; }
      if (src[i] === '\n') { line += 1; break; }
      buf += src[i]; i += 1;
    }
    i += 1;
    out.push({ kind: 'string', text: buf, line: startLine, inner, before: lastBefore });
  }
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line += 1; i += 1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); for (let k = i; k < (e < 0 ? n : e); k++) if (src[k] === '\n') line += 1; i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') { lastBefore = src.slice(Math.max(0, i - 40), i); readQuoted(c); lastSig = 'x'; continue; }
    if (c === '`') { readTemplate(); lastSig = 'x'; continue; }
    if (c === '/' && regexCan()) {
      // a regular expression: up to its closing slash (not one in a class)
      i += 1; let cls = false;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
        else if (src[i] === '/' && !cls) break;
        i += 1;
      }
      i += 1;
      while (i < n && /[a-z]/.test(src[i])) i += 1;
      lastSig = 'x';
      continue;
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z0-9_$]/.test(c)) {
        let w = '';
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { w += src[i]; i += 1; }
        lastSig = w;
        continue;
      }
      lastSig = c;
    }
    i += 1;
  }
  return out;
}

// ------------------------------------------------------------------ what is spoken
// Strings of the code that are not words (keys, names, CSS) and text of the menus.
const CODE_CHARS = /[=<>{}#|\\/_@`~^*[\]]|\.(ogg|wav|json|js|html|mp3)\b|^\s*$/;
const MENU_TEXT = /\b(menu|menus|swipe up and down|double tap to|triple tap|high scores?|speech rate|braille key|key test|gesture practice|leaving the game|screen reader|reset|your score will not be saved|tap the screen once|stopped by your device|newer version|checking for events|one moment|events calendar|sounds loaded|downloading|update|sign|signature|template|event maker|settings?|internet could not|no events are on|go back|paused|live)\b/i;
// The modes' code: what is said during a run lives here. (Help files are left out.)
const RUN_FILES = [
  'js/game.js', 'js/turning.js',
  'js/modes/chaos.js', 'js/modes/driving.js', 'js/modes/findvoice.js', 'js/modes/island.js', 'js/modes/tower.js', 'js/modes/ultimate.js',
  'js/modes/events.js', 'js/modes/events/engine.js', 'js/modes/events/blocks.js', 'js/modes/events/missions.js', 'js/modes/events/more.js',
];
// A word on its own in the code is text only where the code says so: the words
// given to plural() (and their plurals), and the directions.
const PLURAL = /(?:plural|count)\(\s*[^,()]+(?:\([^)]*\))?,\s*'([a-z]+)'(?:,\s*'([a-z]+)')?\s*\)/g;

const speakable = (t) => {
  if (!/[A-Za-z]/.test(t) || CODE_CHARS.test(t)) return false;
  const r = toPhonemes(t);
  return !!r.phonemes;
};

const items = [];          // { text, from }
function addText(text, from) {
  for (const s of sentencesOf(String(text).replace(/\s+/g, ' '))) items.push({ text: s, from });
}

// Parts of those files that are never said during a run: help and demo tables, the
// months of the events calendar, and the methods of the menus, help, practice, the
// key test, pausing and Game Over (the device voice's). Blanked before reading.
const SKIP_DECL = /^(export )?(function (gameHelp|helpRoomFor)|(const|let) (\w*HELP\w*|\w*DEMO\w*|MONTHS|\w*BRAILLE\w*|\w*REASON\w*|\w*ENDS?\b|\w*_WHY\w*))\b/;
const SKIP_METHOD = /^  (async )?(_?(menu|help|practice|score|scores|reset|startKeyTest|changeRate|welcome|toMenu|askQuit|openHelp|speakHelp|playHelp|stopDemo|checkSound|eventMenu|eventLine|eventsMenu|refreshMenu|startPractice|statsKey|countStats)\w*|triggerGameOver|autoPause|_menuInput|_helpInput|_scoresInput|_resetInput|_practiceInput|finish|status|_statusLine|\w*[Rr]esult|\w*[Rr]eason|_eventFinish\w*|_eventMedal\w*|_eventSpeakScore|_eventScoreLines|eventScoresInput|openEventsMenu|_eventBuildMenu|_eventTryStart|_eventLoadThenStart|_utGameOver|_chaosPreviewName)\(/i;
const METHOD = /^  (async |static |get |set )*[_A-Za-z$][\w$]*\s*\([^)]*\)\s*\{/;
function blankSkipped(src) {
  const lines = src.split('\n');
  let skip = null;   // 'decl' or 'method'
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (skip === 'method' && (METHOD.test(l) || /^\S/.test(l))) skip = null;
    if (skip === 'decl' && /^\S/.test(l) && !/^[\]})+]/.test(l)) skip = null;
    if (!skip && SKIP_DECL.test(l)) skip = 'decl';
    else if (!skip && SKIP_METHOD.test(l)) skip = 'method';
    if (skip) lines[k] = '';
    if (skip === 'decl' && /^(\];|\};|\]\)?;?)\s*$/.test(l)) skip = null;
  }
  return lines.join('\n');
}

for (const rel of RUN_FILES) {
  const src = blankSkipped(readFileSync(join(web, rel), 'utf8'));
  let helpRun = false;
  for (const t of textsOfJs(src)) {
    const where = `${rel}:${t.line}`;
    if (t.kind === 'string') {
      const s = t.text;
      // A help entry's title and words (and the strings joined on to them).
      if (/\b(title|desc|about|label)\s*:\s*$/.test(t.before) || (/\+\s*$/.test(t.before) && helpRun)) { helpRun = true; continue; }
      helpRun = false;
      const one = s.trim();
      // A quoted string is text when it has a space in it, or is one capitalised word.
      if (!(/\s/.test(one) || /^[A-Z][a-z]+[.!?,:]?$/.test(one))) continue;
      if (MENU_TEXT.test(s) || !speakable(s)) continue;
      addText(one, where);
    } else {
      const whole = t.pieces.map((p) => (typeof p === 'string' ? p : ' 1 ')).join('');
      if (MENU_TEXT.test(whole)) continue;
      t.pieces.forEach((p0, k) => {
        if (typeof p0 !== 'string' || !/[A-Za-z]/.test(p0)) return;
        // The end of a word begun in the slot before it (`${name}s took the treasure`,
        // `${n} enem${...}`): not a word of its own.
        const p = k > 0 && typeof t.pieces[k - 1] === 'object' ? p0.replace(/^[a-z]+(?=[^A-Za-z']|$)/, (w) => (w === 'a' ? w : '')) : p0;
        if (!/[A-Za-z]/.test(p)) return;
        if (speakable(p)) addText(p.trim().replace(/^[,;:.—\s]+/, ''), where);
        else {
          // A piece ending in part of a word the slot finishes (" wrong tr" + "ies"): the
          // whole words before it.
          const head = p.replace(/[A-Za-z]+$/, '');
          if (head !== p && /[A-Za-z]/.test(head) && speakable(head)) addText(head.trim().replace(/^[,;:.—\s]+/, ''), where);
        }
        // A word made plural by the slot after it (`car${s(n)}`, `enem${n === 1 ? 'y' : 'ies'}`):
        // its plural too, and the phrase the plural begins (`car${s(n)} down`).
        const next = t.pieces[k + 1];
        if (next && typeof next === 'object' && /\bss?\(|['"](s|es|ies|ves|fe|y)['"]/.test(next.slot)) {
          const m = p.match(/([A-Za-z]+)$/);
          if (m) {
            const stem = m[1];
            const after = typeof t.pieces[k + 2] === 'string' ? t.pieces[k + 2] : '';
            const tail = (after.match(/^[^.!?${]*/) || [''])[0];
            const forms = [stem + 's', stem + 'es', stem.replace(/y$/, '') + 'ies', stem + 'ies', stem + 'y', stem + 'ves', stem + 'fe'];
            if (!forms.some((f) => speakable(f))) console.warn('no plural of', stem, 'in the dictionary:', where);
            for (const form of forms) {
              if (!speakable(form)) continue;
              items.push({ text: form, from: where + ' (plural)' });
              if (/[A-Za-z]/.test(tail) && speakable(form + tail)) addText((form + tail).trim(), where + ' (plural)');
            }
          }
        }
      });
    }
  }
  for (const m of src.matchAll(PLURAL)) {
    const one = m[1]; const many = m[2] || `${m[1]}s`;
    for (const w of [one, many]) if (speakable(w)) items.push({ text: w, from: `${rel} plural()` });
  }
}
// The 16 ways you can face, and the four main ones.
for (const w of ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west']) {
  items.push({ text: w, from: 'js/turning.js FACING_WORDS' });
  items.push({ text: `Facing ${w}.`, from: 'js/game.js _facingTail' });
}
// Single words the code says that no rule above picks up (a quoted lower-case word
// is text only where it is said): what the compass names a cartridge.
items.push({ text: 'ammo', from: 'js/modes/ultimate.js _utCompassNearby' });
// The further missions' round words and what finishing them is called.
{
  const more = readFileSync(join(web, 'js/modes/events/more-spec.js'), 'utf8');
  for (const m of more.matchAll(/"(word|finished)": "([^"]+)"/g)) items.push({ text: m[2], from: 'js/modes/events/more-spec.js ' + m[1] });
}

// ------------------------------------------------------------------ the events
const eventFiles = [];
for (const d of [join(win, 'Developer Tools', 'templates'), join(win, 'events')]) {
  if (existsSync(d)) for (const nm of readdirSync(d)) if (nm.endsWith('.json')) eventFiles.push(join(d, nm));
}
const missingPlurals = [];
const SPOKEN_KEYS = /(^|\.|_)(levels|found|stage_name|name|plural|says|line|lines|message|messages|text|story)(\[\])*$/;
function walkEvent(o, path, from) {
  if (typeof o === 'string') {
    // Not text: file names, dates, ids and signatures; and the event's own name and
    // description, which are the menu's.
    if (/^(\.name|\.description|\.id)$/.test(path)) return;
    if (!SPOKEN_KEYS.test(path)) return;
    if (/^[\w-]+\.(ogg|mp3|wav)$/i.test(o) || /^\d{4}-\d\d-\d\dT/.test(o) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(o) || /^[A-Za-z0-9+/=_-]{24,}$/.test(o)) return;
    if (!/[A-Za-z]/.test(o)) return;
    if (!speakable(o)) { console.warn('event text not in the dictionary:', from, path, o); return; }
    addText(o, `${from} ${path}`);
    // A creature's name is made plural by the game ("2 dragons about").
    // (The game adds an s: js/modes/events/engine.js eventStatusReport. Said with what
    // follows it, "dragons about.", through the lines heard: see below.)
    if (/\.name$/.test(path) && /hazard/.test(path)) {
      const many = o + 's';
      if (speakable(many)) items.push({ text: many, from: `${from} ${path} (plural)` });
      else if (/^\.hazards\.name$/.test(path)) { console.warn('NO PLURAL in the dictionary for a creature:', from, path, many); missingPlurals.push(many); }
    }
    return;
  }
  if (Array.isArray(o)) { o.forEach((v) => walkEvent(v, path + '[]', from)); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walkEvent(v, `${path}.${k}`, from);
}
for (const f of eventFiles) walkEvent(JSON.parse(readFileSync(f, 'utf8')), '', relative(win, f));

// ------------------------------------------------------------------ whole lines, numbers in
const EXPANSIONS = [];
const ex = (text, from) => EXPANSIONS.push({ text, from });
for (let n = 1; n <= 30; n++) ex(`Level ${n}.`, 'every mode: Level N.');
for (let n = 1; n <= 60; n++) {
  ex(`${n} second${n === 1 ? '' : 's'} left.`, 'clocks: N seconds left.');
  ex(`${n} second${n === 1 ? '' : 's'} remaining.`, 'clocks: N seconds remaining.');
}
for (let n = 1; n <= 10; n++) ex(`${n} minute${n === 1 ? '' : 's'} left.`, 'clocks: N minutes left.');
ex('Ring once.', 'Call of Fate'); for (let n = 2; n <= 12; n++) ex(`Ring ${n} times.`, 'Call of Fate: Ring N times.');
ex('1 life left.', 'Find the Voice: lives'); for (let n = 2; n <= 3; n++) ex(`${n} lives left.`, 'Find the Voice: lives');
for (let n = 1; n <= 15; n++) ex(`Compass ready in ${n} second${n === 1 ? '' : 's'}.`, 'Ultimate Mode compass');
for (let n = 1; n <= 8; n++) for (let k = 0; k <= n; k++) ex(`${k} of ${n} found.`, 'Find the Voice: finds');
for (const n of [2, 3, 4, 5, 6, 7, 8]) ex(`All ${n} found.`, 'Find the Voice: finds');
ex('Riding the elevator up.', 'Island: the elevator'); ex('Riding the elevator down.', 'Island: the elevator');
for (const t of EXPANSIONS) items.push(t);

// ------------------------------------------------------------------ the compass's sentences
// Ultimate Mode's compass builds its sentences from many small parts
// (js/modes/ultimate.js _utCompassBriefing, _utCompassNearby, _utCompassWords,
// _utCompassWay, _utBearing). Each run of words between two numbers is recorded in
// one piece, for every direction and every thing it can name, so its sentences are
// joined only at their numbers. (The Fable review, 6.1.0.)
{
  const from = 'js/modes/ultimate.js compass';
  const frag = (text) => items.push({ text, from });
  const DIRS = ['north', 'east', 'south', 'west'];
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  const RELS = ['straight ahead', 'behind you', 'to your left', 'to your right'];
  const SUBJECTS = ['the safe zone', 'the way out', 'the bus', 'the way up'];
  const WAYS = ['the way to the safe zone', 'the way out', 'the way up', 'the way to the bus'];
  const AREAS = ['a labyrinth', 'an island', 'a tower area', 'a battle area', 'a safe zone'];
  const THINGS = ['ammo', 'a potion', 'a tower item', 'the water slide', 'a glass case', 'the elevator'];
  const CREDITS = [40, 50, 60];
  for (const sub of [...new Set([...SUBJECTS, ...WAYS])]) frag(`${cap(sub)} is`);
  for (const side of ['left', 'right']) { frag(`degrees to your ${side}.`); frag(`degrees to your ${side};`); }
  for (const d of DIRS) {
    for (const steps of ['steps', 'step']) {
      frag(`${steps} away, starting ${d},`);
      for (const r of RELS) { frag(`${steps} away, starting ${d}, ${r}.`); frag(`${steps} away, starting ${d}, ${r};`); }
    }
    // "The way to the safe zone is north, to your left." / "... is north," 30 "degrees to your left."
    for (const w of WAYS) {
      frag(`${cap(w)} is ${d},`);
      for (const r of RELS) frag(`${cap(w)} is ${d}, ${r}.`);
      frag(`${cap(d)}, ${w}.`);
    }
    for (const side of ['left', 'right']) for (const steps of ['steps', 'step']) frag(`${steps} this way, then turn ${side}, to face ${d}.`);
  }
  for (const steps of ['steps', 'step']) {
    frag(`${steps} this way, and you are there.`);
    frag(`${steps} away.`);
    for (const stop of ['a wall', "the island's edge"]) {
      frag(`${steps}, then ${stop}.`);
      frag(`${steps}, then ${stop}; the edge of the world is`);
    }
    frag(`${steps}, then the edge.`);
    for (const a of AREAS) {
      frag(`${steps}, into ${a}.`);
      frag(`${steps} away, then ${a}.`);
      for (const b of AREAS) if (b !== a || a !== 'a safe zone') frag(`${steps}, into ${a}, then ${b}.`);
    }
  }
  for (const stop of ['A wall', "The island's edge"]) frag(`${stop}; the edge of the world is`);
  for (const a of AREAS) frag(`Beyond, ${a},`);
  for (const t of THINGS) { frag(`Nearby: ${t},`); frag(`${t},`); frag(`Nearby: ${t}, right here.`); frag(`${t}, right here.`); frag(`${t}, right here;`); }
  for (const v of CREDITS) {
    frag(`Nearby: a ${v} credit,`); frag(`a ${v} credit,`);
    frag(`Nearby: a ${v} credit, right here.`); frag(`a ${v} credit, right here.`); frag(`a ${v} credit, right here;`);
  }
}

// ------------------------------------------------------------------ the phrases between the numbers
// Every line the game has been heard to say in a run (tests/voice-capture.json, from
// tools/voice/capture.mjs; tests/voice-event-lines.json, from tests/voice-events.mjs,
// every line every event can say): each sentence is cut at its numbers, and each run of
// words between them is a recording, the last of a sentence said as its ending. So
// "0 shots. 3 wolfs about. 2 lives left." is the numbers and "shots.", "wolfs about.",
// "lives left.", not word by word. (The Fable review, 6.1.0.)
{
  const heard = [];
  const cap1 = join(web, 'tests', 'voice-capture.json');
  const cap2 = join(web, 'tests', 'voice-event-lines.json');
  if (existsSync(cap1)) for (const l of JSON.parse(readFileSync(cap1, 'utf8'))) heard.push([l.text, 'heard in a run: ' + (l.where || '')]);
  if (existsSync(cap2)) for (const l of JSON.parse(readFileSync(cap2, 'utf8'))) heard.push([l, 'said by an event']);
  // Ultimate Mode's rewards are lines of the same kind, seldom met in a short run: a
  // character's gift (_utCastGive), a treasure chest's two or three things in any
  // order (_utOpenChest) and a glass case's one (_utSmashCase).
  {
    const from = 'js/modes/ultimate.js rewards';
    const gifts = ['5 health.', '5 shots of ammo.', '3 tower items.', '5 shots of ammo and 12 health.',
      '5 shots of ammo, 12 health and 1 tower item.', '5 shots of ammo, 12 health and 2 tower items.'];
    for (const g of gifts) heard.push([`You've just received ${g}`, from]);
    const things = { shots: ['8 shots'], points: ['150 points'], items: ['5 tower items'], health: ['40 health', 'full health'] };
    const kinds = Object.keys(things);
    const said = (words) => { const t = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]; return `${t[0].toUpperCase()}${t.slice(1)}.`; };
    const pick = (chosen) => {
      if (chosen.length >= 2) {
        const each = (i, words) => {
          if (i === chosen.length) { heard.push([said(words), from]); heard.push([said([...words, '90 more seconds in this world']), from]); return; }
          for (const w of things[chosen[i]]) each(i + 1, [...words, w]);
        };
        each(0, []);
      }
      if (chosen.length === 3) return;
      for (const k of kinds) if (!chosen.includes(k)) pick([...chosen, k]);
    };
    pick([]);
    for (const c of ['60 points.', '1 point.', '4 shots.', '1 shot.', '60 more seconds in this world.', '2 tower items.', '1 tower item.', '30 health.', '45 more seconds.', '1 more second.']) heard.push([c, from]);
  }
  let skipped = 0;
  for (const [line, from] of heard) {
    for (const s of sentencesOf(String(line).replace(/\s+/g, ' '))) {
      for (const chunk of s.split(/\d[\d,]*(?:\.\d+)?/)) {
        const text = chunk.trim().replace(/^[,;:.—\s]+/, '');
        if (!/[A-Za-z]/.test(text)) continue;
        if (!speakable(text)) { skipped += 1; continue; }
        items.push({ text, from });
      }
    }
  }
  if (skipped) console.warn(`${skipped} phrases of heard lines are not in the dictionary (left to the smaller pieces)`);
}

// ------------------------------------------------------------------ numbers and words
const NUMS = [];
for (let n = 0; n <= 99; n++) NUMS.push(numberWords(n).join(' '));
for (let n = 1; n <= 9; n++) NUMS.push(`${numberWords(n)[0]} hundred`);
NUMS.push('thousand', 'million', 'point', 'percent', 'minus', 'hundred');

// ------------------------------------------------------------------ the list
const clips = [];
const seen = new Map();   // voice|key|end -> clip
let nb = 0;
function addClip(voice, key, end, kind, text, from, prefix) {
  const k = `${voice}|${key}|${end ? 1 : 0}`;
  const have = seen.get(k);
  if (have) { if (!have.from.includes(from) && have.from.length < 6) have.from.push(from); return have; }
  const ph = toPhonemes(text).phonemes;
  if (!ph) throw new Error('not in the dictionary: ' + text);
  const c = { name: `${prefix}${(nb += 1).toString(36)}`, voice, key, end: end ? 1 : 0, kind, text, phonemes: ph, from: [from] };
  seen.set(k, c);
  clips.push(c);
  return c;
}
const vocab = new Set();
for (const it of items) {
  const p = wordsOfSentence(it.text);
  if (!p || !p.words.length) continue;
  // A recorded piece is said as the text has it: an ending when it ends with . ! or ?;
  // within a sentence, without the comma or colon it may end with.
  const text = p.end ? it.text.trim() : it.text.trim().replace(/[,;:—…\s]+$/, '');
  addClip('af_bella', keyOf(p.words), !!p.end, p.words.length === 1 && /^[a-z']+$/.test(p.words[0]) && it.from.includes('plural()') ? 'line' : 'line', text, it.from, 'b');
  for (const w of p.words) vocab.add(w);
}
for (const w of NUMS) {
  addClip('af_bella', w, false, 'num', w, 'numbers', 'b');
  addClip('af_bella', w, true, 'num', w + '.', 'numbers', 'b');
}
for (const w of [...vocab].sort()) {
  if (w.startsWith('letter:')) { addClip('af_bella', w, false, 'word', w.slice(7).toUpperCase(), 'letters', 'b'); continue; }
  addClip('af_bella', w, false, 'word', w, 'words on their own', 'b');
}

// The guide.
const guide = JSON.parse(readFileSync(join(web, 'js/data/guide_phrases.json'), 'utf8'));
const guideClips = guide.phrases.map((p) => ({ name: `g${p.id}`, voice: guide.voice || 'af_heart', id: p.id, text: p.text, phonemes: p.phonemes }));
// The characters.
const cast = JSON.parse(readFileSync(join(web, 'js/data/safe-zone-cast.json'), 'utf8'));
const voiceOf = new Map(cast.characters.map((c) => [c.id, c.voice]));
const story = JSON.parse(readFileSync(join(web, 'js/data/story-lines.json'), 'utf8'));
const castClips = story.lines.map((l) => ({ name: `c${l.id}`, voice: voiceOf.get(l.character), id: l.id, text: l.text, phonemes: l.phonemes }));
if (castClips.some((c) => !c.voice)) throw new Error('a story line without a character voice');

// The numbers the model reads (Kokoro's table: js/bella-words.js), for the maker.
for (const c of [...clips, ...guideClips, ...castClips]) {
  c.ids = toTokens(c.phonemes);
  if (c.ids.length >= MAX_TOKENS) c.long = true;   // made sentence by sentence
}
if (missingPlurals.length) { console.error('Add to js/bella-lexicon.js: ' + missingPlurals.join(', ')); process.exit(1); }
const out = { format: 1, made: 'web 6.1.0', bella: clips, guide: guideClips, cast: castClips };
writeFileSync(outFile, JSON.stringify(out, null, 0));
const by = (k) => clips.filter((c) => c.kind === k).length;
console.log(`Bella ${clips.length} (line ${by('line')}, num ${by('num')}, word ${by('word')}); guide ${guideClips.length}; cast ${castClips.length}; event files ${eventFiles.length}`);
