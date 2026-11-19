// Bella's words (web 6.0.0): a line of the game's text turned into the phonemes
// the Kokoro voice model reads, and those into the numbers it takes.
//
// This is deliberately small, like Escape the Cave's cave_phonemes.py: it only
// looks words up in the game's own hand-written dictionary (bella-lexicon.js) and
// spells numbers out. There is no guessing and no outside helper (no eSpeak NG,
// nothing under the GPL). If any word of a line is not in the dictionary, the line
// cannot be said by Bella: toPhonemes returns no phonemes and the words that were
// missing, and the game's speech says that line with the device's own voice.
// Runs in a page, in a worker and in Node (the tests), so nothing here needs a DOM.

import { LEXICON, LETTERS, THE_BEFORE_VOWEL, TO_BEFORE_VOWEL, USE_AS_VERB } from './bella-lexicon.js';

// Kokoro's own table of symbols (the "vocab" of hexgrad/Kokoro-82M's config.json,
// Apache 2.0): each phoneme or punctuation mark is one number to the model. The
// same table as Escape the Cave's cave_phonemes.py.
export const VOCAB = Object.freeze({
  ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '—': 9, '…': 10, '"': 11, '(': 12,
  ')': 13, '“': 14, '”': 15, ' ': 16, '̃': 17, 'ʣ': 18, 'ʥ': 19, 'ʦ': 20, 'ʨ': 21,
  'ᵝ': 22, 'ꭧ': 23, A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36, W: 39,
  Y: 41, 'ᵊ': 42, a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51,
  j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61,
  t: 62, u: 63, v: 64, w: 65, x: 66, y: 67, z: 68, 'ɑ': 69, 'ɐ': 70, 'ɒ': 71,
  'æ': 72, 'β': 75, 'ɔ': 76, 'ɕ': 77, 'ç': 78, 'ɖ': 80, 'ð': 81, 'ʤ': 82, 'ə': 83, 'ɚ': 85,
  'ɛ': 86, 'ɜ': 87, 'ɟ': 90, 'ɡ': 92, 'ɥ': 99, 'ɨ': 101, 'ɪ': 102, 'ʝ': 103, 'ɯ': 110,
  'ɰ': 111, 'ŋ': 112, 'ɳ': 113, 'ɲ': 114, 'ɴ': 115, 'ø': 116, 'ɸ': 118, 'θ': 119, 'œ': 120,
  'ɹ': 123, 'ɾ': 125, 'ɻ': 126, 'ʁ': 128, 'ɽ': 129, 'ʂ': 130, 'ʃ': 131, 'ʈ': 132, 'ʧ': 133,
  'ʊ': 135, 'ʋ': 136, 'ʌ': 138, 'ɣ': 139, 'ɤ': 140, 'χ': 142, 'ʎ': 143, 'ʒ': 147, 'ʔ': 148,
  'ˈ': 156, 'ˌ': 157, 'ː': 158, 'ʰ': 162, 'ʲ': 164, '↓': 169, '→': 171, '↗': 172, '↘': 173,
  'ᵻ': 177,
});
// The most phonemes the model takes in one go (its 512 positions, less the two
// pads), and the rows of a voice's style table.
export const MAX_TOKENS = 510;

const VOWELS = new Set('AIOWYaeiouɑɐɒæɔəɚɛɜɪʊʌᵻᵊ');
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL = {
  one: 'first', two: 'second', three: 'third', four: 'fourth', five: 'fifth', six: 'sixth',
  seven: 'seventh', eight: 'eighth', nine: 'ninth', ten: 'tenth', eleven: 'eleventh',
  twelve: 'twelfth', thirteen: 'thirteenth', fourteen: 'fourteenth', fifteen: 'fifteenth',
  sixteen: 'sixteenth', seventeen: 'seventeenth', eighteen: 'eighteenth', nineteen: 'nineteenth',
  twenty: 'twentieth', thirty: 'thirtieth', forty: 'fortieth', fifty: 'fiftieth', sixty: 'sixtieth',
  seventy: 'seventieth', eighty: 'eightieth', ninety: 'ninetieth', hundred: 'hundredth',
  thousand: 'thousandth',
};

// 127 -> ['one', 'hundred', 'twenty', 'seven']. Whole numbers below a billion;
// null for anything else (the line then goes to the device's voice).
export function numberWords(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 0 || n > 999999999) return null;
  if (n < 20) return [ONES[n]];
  if (n < 100) return [TENS[Math.floor(n / 10)], ...(n % 10 ? [ONES[n % 10]] : [])];
  if (n < 1000) return [ONES[Math.floor(n / 100)], 'hundred', ...(n % 100 ? numberWords(n % 100) : [])];
  if (n < 1000000) return [...numberWords(Math.floor(n / 1000)), 'thousand', ...(n % 1000 ? numberWords(n % 1000) : [])];
  return [...numberWords(Math.floor(n / 1000000)), 'million', ...(n % 1000000 ? numberWords(n % 1000000) : [])];
}

// 21 -> ['twenty', 'first'].
export function ordinalWords(n) {
  const w = numberWords(n);
  if (!w) return null;
  const last = w[w.length - 1];
  return ORDINAL[last] ? [...w.slice(0, -1), ORDINAL[last]] : null;
}

// One token of text at a time: a number (with its thousands commas, a decimal
// part, an ordinal ending or a percent sign), a word (with an apostrophe inside
// it), a run of punctuation, or any other single character.
const TOKEN = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(st|nd|rd|th)?(%)?|[A-Za-z]+(?:'[A-Za-z]+)*|[.,!?;:—…()]|\s+|./gu;
const PAUSE = { '(': ',', ')': ',', ';': ';', ':': ':', '—': '—', '…': '…' };

function normalise(text) {
  return String(text)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”"]/g, ' ')
    .replace(/\s*--+\s*/g, ' — ')
    .replace(/\s+[-–]\s+/g, ' — ')
    .replace(/–/g, '-')
    .replace(/\.\.\./g, '…');
}

// The text as a list of items: ['word', 'level'], ['letter', 'b'], ['punct', '.'],
// ['missing', what]. Numbers are spelled out, a capital standing alone is a letter,
// and capitals not in the dictionary (NVDA) are spelled letter by letter.
export function wordsOf(text) {
  const items = [];
  const src = normalise(text);
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(src))) {
    const tok = m[0];
    if (m[1] !== undefined) {
      const whole = Number(m[1].replace(/,/g, ''));
      // A minus sign straight before the number, after a space or at the start.
      const before = src.slice(Math.max(0, m.index - 2), m.index);
      if (/(^|\s)-$/.test(before) || (m.index === 1 && src[0] === '-')) items.push(['word', 'minus']);
      let words;
      if (m[3]) {
        words = m[2] === undefined ? ordinalWords(whole) : null;
      } else {
        words = numberWords(whole);
        if (words && m[2] !== undefined) {
          words = [...words, 'point', ...[...m[2]].map((d) => ONES[Number(d)])];
        }
      }
      if (!words) { items.push(['missing', tok]); continue; }
      for (const w of words) items.push(['word', w]);
      if (m[4]) items.push(['word', 'percent']);
    } else if (/^[A-Za-z]/.test(tok)) {
      const low = tok.toLowerCase();
      if (tok.length === 1 && low !== 'a' && low !== 'i') items.push(['letter', low]);
      else if (tok.length > 1 && tok === tok.toUpperCase() && !(low in LEXICON) && /^[A-Z]+$/.test(tok)) {
        for (const ch of low) items.push(['letter', ch]);
      } else items.push(['word', low]);
    } else if ('.,!?'.includes(tok)) items.push(['punct', tok]);
    else if (PAUSE[tok]) items.push(['punct', PAUSE[tok]]);
    else if (/^\s+$/.test(tok) || tok === '-' || tok === "'") {
      // a space, a hyphen joining two words, an apostrophe on its own: nothing said
    } else if (tok === '&') items.push(['word', 'and']);
    else if (tok === '+') items.push(['word', 'plus']);
    else items.push(['missing', tok]);
  }
  return items;
}

// A word's phonemes from the dictionary, or null. A word ending in 's (the
// guard's, it's, that's) is its own word with the ending added by the usual rule
// when the dictionary does not have it whole.
export function lookup(word) {
  if (Object.prototype.hasOwnProperty.call(LEXICON, word)) return LEXICON[word];
  if (word.endsWith("'s")) {
    const base = word.slice(0, -2);
    if (Object.prototype.hasOwnProperty.call(LEXICON, base)) {
      const p = LEXICON[base];
      const last = p[p.length - 1];
      if ('szʃʒʧʤ'.includes(last)) return p + 'ᵻz';
      if ('ptkfθ'.includes(last)) return p + 's';
      return p + 'z';
    }
  }
  return null;
}

function startsWithVowel(ph) {
  for (const ch of ph) {
    if (ch === 'ˈ' || ch === 'ˌ') continue;
    return VOWELS.has(ch);
  }
  return false;
}

// { phonemes, missing }: the line in Kokoro's phonemes, or phonemes null and the
// words (or numbers, or signs) that have no entry.
export function toPhonemes(text) {
  const sounds = [];
  const missing = [];
  for (const [kind, value] of wordsOf(text)) {
    if (kind === 'punct') sounds.push(['punct', value]);
    else if (kind === 'letter') sounds.push(['word', LETTERS[value], value]);
    else if (kind === 'word') {
      const ph = lookup(value);
      if (ph) sounds.push(['word', ph, value]); else missing.push(value);
    } else missing.push(value);
  }
  if (missing.length) return { phonemes: null, missing };
  let out = '';
  for (let i = 0; i < sounds.length; i++) {
    const s = sounds[i];
    if (s[0] === 'punct') {
      if (!out) continue;                       // nothing said yet: no pause to make
      if (/[.,!?;:—…]$/.test(out)) {
        // Two marks together ("Over here!", "...", "! ,"): the stronger one stays.
        if (',;:'.includes(out[out.length - 1]) && !',;:'.includes(s[1])) out = out.slice(0, -1) + s[1];
        continue;
      }
      out += s[1];
      continue;
    }
    let ph = s[1];
    const word = s[2];
    const next = sounds[i + 1] && sounds[i + 1][0] === 'word' ? sounds[i + 1] : null;
    if (next) {
      if (word === 'the' && startsWithVowel(next[1])) ph = THE_BEFORE_VOWEL;
      else if (word === 'to' && startsWithVowel(next[1])) ph = TO_BEFORE_VOWEL;
      else if (word === 'use' && ['the', 'a', 'your', 'it', 'them', 'this', 'that'].includes(next[2])) ph = USE_AS_VERB;
    }
    if (out) out += ' ';
    out += ph;
  }
  out = out.trim();
  if (!/[^\s.,!?;:—…]/.test(out)) return { phonemes: null, missing: [] };
  return { phonemes: out, missing: [] };
}

// The numbers the model reads for a phoneme string (without the two pads).
export function toTokens(phonemes) {
  const ids = [];
  for (const ch of phonemes) if (VOCAB[ch] !== undefined) ids.push(VOCAB[ch]);
  return ids.slice(0, MAX_TOKENS);
}

// Whether Bella can say the whole of this text.
export function covers(text) {
  const { phonemes } = toPhonemes(text);
  return !!phonemes && toTokens(phonemes).length < MAX_TOKENS;
}

// A line in sentences, so each can be made while the one before it plays (the
// same split as js/speech.js).
export function sentences(text) {
  const parts = String(text).trim().split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => /\w/.test(p));
  return parts;
}
