// The recorded voice's words (web 6.1.0): how a line of the game's text is matched
// to the recordings that say it.
//
// Russell (19 November 2026): every line the game speaks during a run is played
// from pre-recorded sound files, made once with Kokoro in Claude's workspace, so
// nothing is made on the player's device. A line the game builds itself (a number,
// a score, a direction) is said by joining recordings: the fixed words of the line
// and the numbers, each recorded on its own ("stitched numbers", which he accepted).
//
// This file is shared by the game (js/voice.js) and the tool that lists and makes
// the recordings (tools/voice/), so a line is cut into exactly the same words in
// both places:
//
//   sentenceParts(text) -> [{ words: ['wave', 'three'], pauses: Set of word
//                             indexes followed by a comma, end: '.' }] or null
//   keyOf(words)        -> 'wave three'
//   plan(text, index)   -> [[{ name, gapBefore }...] per sentence] or null
//
// A recording is known by the words it says (its key), whether it was said as the
// end of a sentence (end) and what kind it is: 'line' (words of the game's own text,
// a phrase or a whole sentence), 'num' (a number, 0 to 99, or 'two hundred') and
// 'word' (one word on its own, used only to join a few words the game puts
// together in a way no phrase covers). plan() covers each sentence with as few
// recordings as it can (a whole sentence when there is one), never with more than
// MAX_LONE_WORDS words on their own; a sentence it cannot cover makes the whole line
// the device voice's (js/speech.js), never silence.

import { wordsOf } from './bella-words.js';

export const MAX_LONE_WORDS = 3;     // words on their own in one sentence, at most
export const MAX_PIECE = 48;         // the most words one recording says
export const GAP_JOIN = 0;           // ms of quiet added between two recordings of one sentence
export const GAP_COMMA = 110;        // ... where the text has a comma (or a colon, a dash)
export const GAP_SENTENCE = 160;     // ... between two sentences

// The same split into sentences as js/speech.js.
export function sentencesOf(text) {
  return String(text).trim().split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => /\w/.test(p));
}

export function keyOf(words) { return words.join(' '); }

// One sentence as its words ('letter:b' for a letter said on its own), the places a
// pause comes after a word, and how it ends. null if it holds anything that cannot
// be said (a sign, a number too big).
export function wordsOfSentence(s) {
  const words = [];
  const pauses = new Set();
  for (const [kind, value] of wordsOf(s)) {
    if (kind === 'missing') return null;
    if (kind === 'word') words.push(value);
    else if (kind === 'letter') words.push('letter:' + value);
    else if (kind === 'punct' && words.length && ',;:—…'.includes(value)) pauses.add(words.length - 1);
  }
  const m = String(s).trim().match(/([.!?])["')\]]*$/);
  return { words, pauses, end: m ? m[1] : '' };
}

export function sentenceParts(text) {
  const out = [];
  for (const s of sentencesOf(text)) {
    const p = wordsOfSentence(s);
    if (!p) return null;
    if (p.words.length) out.push(p);
  }
  return out.length ? out : null;
}

// The recordings' index: key -> [{ name, end, kind }]. Built once from the voice
// pack's entries (js/voice.js) or from the tool's list.
export function makeIndex(entries) {
  const index = new Map();
  let longest = 1;
  for (const e of entries) {
    if (!e || !e.key) continue;
    const list = index.get(e.key) || [];
    list.push({ name: e.name, end: !!e.end, kind: e.k || 'line' });
    index.set(e.key, list);
    longest = Math.max(longest, e.key.split(' ').length);
  }
  index.longest = Math.min(MAX_PIECE, longest);
  return index;
}

// The cheapest way to say one sentence's words with the recordings: fewest pieces,
// a sentence's last piece one said as an ending and the others not, numbers and
// phrases before words on their own. Returns [{ name, from, to, kind }] or null.
export function coverSentence(words, index, last = true) {
  const n = words.length;
  // best[i][l]: the cheapest way to say the first i words with l words on their own.
  // (Kept for each l, so a cheap way that has used up its lone words never hides a
  // dearer one that still has some to spend: the Fable review, 6.1.0.)
  const L = MAX_LONE_WORDS + 1;
  const best = Array.from({ length: n + 1 }, () => new Array(L).fill(null));
  best[0][0] = { cost: 0, prev: -1, prevLone: 0, pick: null };
  const longest = index.longest || MAX_PIECE;
  for (let i = 0; i < n; i++) {
    for (let l = 0; l < L; l++) {
      const here = best[i][l];
      if (!here) continue;
      for (let j = i + 1; j <= Math.min(n, i + longest); j++) {
        const list = index.get(keyOf(words.slice(i, j)));
        if (!list) continue;
        const wantEnd = last && j === n;
        for (const c of list) {
          let cost = 1;
          if (c.end !== wantEnd) cost += 0.3;
          if (c.kind === 'word') cost += 0.8;
          const lone = l + (c.kind === 'word' ? 1 : 0);
          if (lone > MAX_LONE_WORDS) continue;
          const total = here.cost + cost;
          if (!best[j][lone] || total < best[j][lone].cost - 1e-9) best[j][lone] = { cost: total, prev: i, prevLone: l, pick: c };
        }
      }
    }
  }
  let at = -1;
  for (let l = 0; l < L; l++) if (best[n][l] && (at < 0 || best[n][l].cost < best[n][at].cost - 1e-9)) at = l;
  if (at < 0) return null;
  const pieces = [];
  for (let j = n, l = at; j > 0;) {
    const b = best[j][l];
    pieces.unshift({ name: b.pick.name, from: b.prev, to: j, kind: b.pick.kind });
    j = b.prev; l = b.prevLone;
  }
  return pieces;
}

// A whole line: per sentence, the recordings to play and the quiet before each.
export function plan(text, index) {
  const parts = sentenceParts(text);
  if (!parts) return null;
  const out = [];
  for (let s = 0; s < parts.length; s++) {
    const p = parts[s];
    const pieces = coverSentence(p.words, index, true);
    if (!pieces) return null;
    out.push(pieces.map((pc, i) => ({
      name: pc.name,
      kind: pc.kind,
      gapBefore: i === 0 ? (s === 0 ? 0 : GAP_SENTENCE) : (p.pauses.has(pc.from - 1) ? GAP_COMMA : GAP_JOIN),
    })));
  }
  return out;
}
