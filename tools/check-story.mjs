// Checks the Ultimate Mode safe zone cast and story lines (web 6.0.0).
// Run from the repository folder:  node tools/check-story.mjs
//
// It checks that:
//  - every one of the 54 safe zone backgrounds has exactly one character, and every
//    character has its own Kokoro voice (never af_bella or af_heart, which are taken);
//  - every line has an id (no two the same), a known type and a pronunciation;
//  - every phoneme is in Kokoro's vocabulary, British lines use only British Misaki
//    symbols and American lines only American ones, and no line is too long for the model;
//  - every word's phonemes in a line are the ones in the word table (story-lexicon.json);
//  - no line is repeated and no banned word is used;
// and it prints how many lines of each type every character has.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(join(root, 'js', 'data', f), 'utf8'));
const cast = load('safe-zone-cast.json');
const lines = load('story-lines.json').lines;
const lex = load('story-lexicon.json');

// Kokoro's own symbol table (hexgrad/Kokoro-82M config.json "vocab", Apache 2.0).
const VOCAB = new Set([...';:,.!?—…"()“” ̃ʣʥʦʨᵝꭧAIOQSTWYᵊabcdefhijklmnopqrstuvwxyzɑɐɒæβɔɕçɖðʤəɚɛɜɟɡɥɨɪʝɯɰŋɳɲɴøɸθœɹɾɻʁɽʂʃʈʧʊʋʌɣɤχʎʒʔˈˌːʰʲ↓→↗↘ᵻ']);
const US_ONLY = new Set([...'æOɾᵻ']);   // Misaki symbols only the American voices use
const GB_ONLY = new Set([...'aQɒː']);   // and only the British ones
const MAX_TOKENS = 510;
const BACKGROUNDS = ('bees blizzard cafe campfire cathedral cathedral_organ cave_drips cicadas city_night clock crickets dark_choir ' +
  'desert fast_food fireplace fireworks forest_night ghost_choir graveyard halloween_strings haunted_house haunted_space ' +
  'howling_wind ice_cave industrial jungle kitchen lava library market marsh_frogs medieval_village morning_birds ' +
  'ocean_night organ rain restaurant_kitchen river ship_creak sizzling_oil space spaceship spooky spring_birds storm ' +
  'summer tavern train_station underwater water_drip waterfall wind_trees winter_wind witch').split(' ').map((b) => 'evt_amb_' + b);
const VOICES = ('af_alloy af_aoede af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky am_adam am_echo am_eric ' +
  'am_fenrir am_liam am_michael am_onyx am_puck am_santa bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable ' +
  'bm_george bm_lewis').split(' ');
const TYPES = ['greeting', 'callback', 'gift', 'story-hint', 'story'];
const BANNED = ['damn', 'damned', 'hell', 'crap', 'stupid', 'idiot', 'shut up', 'kill', 'kills', 'killed', 'killing',
  'blood', 'bloody', 'murder', 'gun', 'guns', 'god', 'gods', 'jesus', 'christ', 'satan', 'devil', 'demon', 'demons',
  'dead', 'death', 'die', 'died', 'dying', 'corpse', 'suicide', 'drunk', 'beer', 'wine', 'whiskey', 'alcohol',
  'sex', 'sexy', 'hate you', 'shoot', 'weapon', 'bomb'];

const errors = [];
const err = (m) => { if (errors.length < 200) errors.push(m); else if (errors.length === 200) errors.push('...'); };

// ------------------------------------------------------------------ the cast
const chars = new Map(cast.characters.map((c) => [c.id, c]));
if (cast.characters.length !== 26) err(`cast has ${cast.characters.length} characters, expected 26`);
const owner = new Map();
for (const c of cast.characters) {
  for (const b of c.backgrounds) {
    if (!BACKGROUNDS.includes(b)) err(`${c.id}: ${b} is not a safe zone background`);
    if (owner.has(b)) err(`${b} has two characters: ${owner.get(b)} and ${c.id}`);
    owner.set(b, c.id);
  }
  if (c.id !== 'witch' && (c.backgrounds.length < 2 || c.backgrounds.length > 3)) err(`${c.id} lives in ${c.backgrounds.length} backgrounds (2 or 3 expected)`);
  if (!VOICES.includes(c.voice)) err(`${c.id}: voice ${c.voice} is not one of the 26 voices for the cast`);
  if ((c.voice[0] === 'b') !== (c.accent === 'gb')) err(`${c.id}: accent ${c.accent} does not match voice ${c.voice}`);
  if (cast.backgroundToCharacter[c.backgrounds[0]] !== c.id) err(`backgroundToCharacter disagrees for ${c.id}`);
}
for (const b of BACKGROUNDS) if (!owner.has(b)) err(`${b} has no character`);
const voices = cast.characters.map((c) => c.voice);
if (new Set(voices).size !== voices.length) err('two characters share a voice');
if (chars.get('witch')?.backgrounds.join() !== 'evt_amb_witch') err('the Witch must live alone in evt_amb_witch');

// ------------------------------------------------------------------ the lines
const TOK = /[A-Za-z]+(?:'[A-Za-z]+)*|[.,!?;:]/g;
const keyOf = (w) => (w.length === 1 && !['a', 'A', 'I'].includes(w)) ? 'letter:' + w.toLowerCase() : w.toLowerCase();
const ids = new Set(); const texts = new Map(); const counts = new Map();
for (const l of lines) {
  const where = l.id || JSON.stringify(l).slice(0, 60);
  if (!l.id) err(`a line has no id: ${where}`);
  else if (ids.has(l.id)) err(`id used twice: ${l.id}`);
  ids.add(l.id);
  const c = chars.get(l.character);
  if (!c) { err(`${where}: unknown character ${l.character}`); continue; }
  if (!TYPES.includes(l.type)) err(`${where}: unknown type ${l.type}`);
  if (l.hint !== (l.type === 'story-hint')) err(`${where}: hint flag does not match type`);
  if (!l.text || !l.text.trim()) err(`${where}: no text`);
  if (!l.phonemes || !l.phonemes.trim()) { err(`${where}: no pronunciation`); continue; }
  const k = l.text.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
  if (texts.has(k)) err(`${where}: same line as ${texts.get(k)}`); else texts.set(k, l.id);
  const low = ' ' + l.text.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const b of BANNED) if (low.includes(' ' + b + ' ')) err(`${where}: banned word "${b}"`);
  for (const ch of l.phonemes) {
    if (!VOCAB.has(ch)) err(`${where}: "${ch}" is not in Kokoro's vocabulary`);
    if (c.accent === 'gb' && US_ONLY.has(ch)) err(`${where}: American-only symbol "${ch}" in a British line`);
    if (c.accent === 'us' && GB_ONLY.has(ch)) err(`${where}: British-only symbol "${ch}" in an American line`);
  }
  if ([...l.phonemes].filter((ch) => VOCAB.has(ch)).length > MAX_TOKENS) err(`${where}: longer than ${MAX_TOKENS} phonemes`);
  // every word's phonemes are the word table's (or a tagged form of the word, or the/to before a vowel)
  const words = (l.text.match(TOK) || []).filter((t) => /[A-Za-z]/.test(t));
  const phw = l.phonemes.split(' ').map((p) => p.replace(/[.,!?;:]+$/, ''));
  const table = lex[c.accent];
  if (words.length !== phw.length) err(`${where}: ${words.length} words but ${phw.length} pronounced words`);
  else words.forEach((w, i) => {
    const key = keyOf(w);
    const ok = [table[key], ...Object.keys(table).filter((x) => x.startsWith(key + '|')).map((x) => table[x])];
    if (key === 'the') ok.push('ði'); if (key === 'to') ok.push('tʊ');
    if (w === 'A') ok.push(table['letter:a']);   // "an A": the letter said on its own
    if (!ok.includes(phw[i])) err(`${where}: "${w}" said ${phw[i]}, the word table has ${ok.filter(Boolean).join(' or ') || 'nothing'}`);
  });
  const n = counts.get(l.character) || Object.fromEntries(TYPES.map((t) => [t, 0]));
  n[l.type]++; counts.set(l.character, n);
}

// ------------------------------------------------------------------ counts
let total = Object.fromEntries(TYPES.map((t) => [t, 0]));
console.log('character      voice        greet  call  gift  hints  story  (story lines in all)');
for (const c of cast.characters) {
  const n = counts.get(c.id) || {};
  for (const t of TYPES) total[t] += n[t] || 0;
  const st = (n['story-hint'] || 0) + (n.story || 0);
  console.log(`${c.id.padEnd(14)} ${c.voice.padEnd(12)} ${String(n.greeting || 0).padStart(5)} ${String(n.callback || 0).padStart(5)} ${String(n.gift || 0).padStart(5)} ${String(n['story-hint'] || 0).padStart(6)} ${String(n.story || 0).padStart(6)}  (${st})`);
  for (const t of TYPES) if (!n[t]) err(`${c.id} has no ${t} lines`);
  if ((n['story-hint'] || 0) < st / 2) err(`${c.id}: fewer than half of the story lines are hints`);
}
const storyAll = total['story-hint'] + total.story;
console.log(`TOTAL: ${lines.length} lines; greetings ${total.greeting}, call-backs ${total.callback}, gift lines ${total.gift}, story lines ${storyAll} (hints ${total['story-hint']}).`);
if (errors.length) { console.log(`\nFAILED: ${errors.length} problem(s)`); for (const e of errors) console.log('  ' + e); process.exit(1); }
console.log('\nALL CHECKS PASSED');
