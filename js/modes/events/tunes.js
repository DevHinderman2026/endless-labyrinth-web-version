// The tunes the game can play itself, note by note, and the instruments it plays
// them on (web 5.0.0): the desktop's event_tunes.py, with the same tunes, the same
// instruments and the same arithmetic, so an event sounds the same in both games.
// Used by events whose items are musical fragments: each memory in Trapped in
// Darkness, each hidden thing in an Echo Hunt, each piece in Rebuild the Song.
//
// Every tune is old enough to be free for anyone to use, and every sound is made
// by the game from sine waves: no recording, no outside source.
//
// THE TABLES BELOW ARE WRITTEN OUT FROM event_tunes.py. Change them there first.
// A tune is [what the Event Maker calls it, seconds per beat, the notes]; a note is
// [MIDI note number, length in beats]. 60 is middle C.

import { randint } from './py.js';

const SR = 44100;
const I16 = 32767;          // made sounds are kept on the desktop's int16 scale (see sounds.js)

export const TUNES = {
  ode_to_joy: ["Ode to Joy (Beethoven)", 0.42, [[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[64,1.5],[62,0.5],[62,2],[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[62,1.5],[60,0.5],[60,2]]],
  greensleeves: ["Greensleeves (traditional)", 0.36, [[69,1],[72,2],[74,1],[76,1.5],[77,0.5],[76,1],[74,2],[71,1],[67,1.5],[69,0.5],[71,1],[72,2],[69,1],[69,1.5],[68,0.5],[69,1],[71,2],[68,1],[64,2],[69,1],[72,2],[74,1],[76,1.5],[77,0.5],[76,1],[74,2],[71,1],[67,1.5],[69,0.5],[71,1],[72,1.5],[71,0.5],[69,1],[68,1.5],[66,0.5],[68,1],[69,3]]],
  amazing_grace: ["Amazing Grace (traditional)", 0.5, [[62,1],[67,2],[71,0.5],[67,0.5],[71,2],[69,1],[67,2],[64,1],[62,2],[62,1],[67,2],[71,0.5],[67,0.5],[71,2],[69,1],[74,5],[71,1],[74,1.5],[71,0.5],[74,0.5],[71,0.5],[67,2],[62,1],[64,1.5],[67,0.5],[67,0.5],[64,0.5],[62,2],[62,1],[67,2],[71,0.5],[67,0.5],[71,2],[69,1],[67,3]]],
  brahms_lullaby: ["Brahms' Lullaby", 0.5, [[64,0.5],[64,0.5],[67,1.5],[64,0.5],[64,1],[67,2],[64,0.5],[67,0.5],[72,1],[71,1.5],[69,0.5],[69,1],[67,1],[62,0.5],[64,0.5],[65,1],[62,1],[62,0.5],[64,0.5],[65,2],[62,0.5],[65,0.5],[71,0.5],[69,0.5],[67,1],[71,1],[72,2]]],
  twinkle: ["Twinkle, Twinkle, Little Star (traditional)", 0.42, [[60,1],[60,1],[67,1],[67,1],[69,1],[69,1],[67,2],[65,1],[65,1],[64,1],[64,1],[62,1],[62,1],[60,2],[67,1],[67,1],[65,1],[65,1],[64,1],[64,1],[62,2],[67,1],[67,1],[65,1],[65,1],[64,1],[64,1],[62,2],[60,1],[60,1],[67,1],[67,1],[69,1],[69,1],[67,2],[65,1],[65,1],[64,1],[64,1],[62,1],[62,1],[60,2]]],
  frere_jacques: ["Frere Jacques (traditional)", 0.4, [[60,1],[62,1],[64,1],[60,1],[60,1],[62,1],[64,1],[60,1],[64,1],[65,1],[67,2],[64,1],[65,1],[67,2],[67,0.5],[69,0.5],[67,0.5],[65,0.5],[64,1],[60,1],[67,0.5],[69,0.5],[67,0.5],[65,0.5],[64,1],[60,1],[60,1],[55,1],[60,2],[60,1],[55,1],[60,2]]],
  silent_night: ["Silent Night (Gruber)", 0.5, [[67,1.5],[69,0.5],[67,1],[64,3],[67,1.5],[69,0.5],[67,1],[64,3],[74,2],[74,1],[71,3],[72,2],[72,1],[67,3],[69,2],[69,1],[72,1.5],[71,0.5],[69,1],[67,1.5],[69,0.5],[67,1],[64,3],[69,2],[69,1],[72,1.5],[71,0.5],[69,1],[67,1.5],[69,0.5],[67,1],[64,3],[74,2],[74,1],[77,1.5],[74,0.5],[71,1],[72,3],[76,3],[72,1.5],[67,0.5],[64,1],[67,1.5],[65,0.5],[62,1],[60,3]]],
  jingle_bells: ["Jingle Bells (Pierpont)", 0.3, [[64,1],[64,1],[64,2],[64,1],[64,1],[64,2],[64,1],[67,1],[60,1.5],[62,0.5],[64,4],[65,1],[65,1],[65,1.5],[65,0.5],[65,1],[64,1],[64,1],[64,0.5],[64,0.5],[64,1],[62,1],[62,1],[64,1],[62,2],[67,2],[64,1],[64,1],[64,2],[64,1],[64,1],[64,2],[64,1],[67,1],[60,1.5],[62,0.5],[64,4],[65,1],[65,1],[65,1.5],[65,0.5],[65,1],[64,1],[64,1],[64,0.5],[64,0.5],[67,1],[67,1],[65,1],[62,1],[60,4]]],
  auld_lang_syne: ["Auld Lang Syne (traditional)", 0.45, [[60,1],[65,1.5],[65,0.5],[65,1],[69,1],[67,1.5],[65,0.5],[67,1],[69,1],[65,1.5],[65,0.5],[69,1],[72,1],[74,3],[74,1],[72,1.5],[69,0.5],[69,1],[65,1],[67,1.5],[65,0.5],[67,1],[69,1],[65,1.5],[62,0.5],[62,1],[60,1],[65,3]]],
  fur_elise: ["Fur Elise (Beethoven)", 0.34, [[76,0.5],[75,0.5],[76,0.5],[75,0.5],[76,0.5],[71,0.5],[74,0.5],[72,0.5],[69,1.5],[60,0.5],[64,0.5],[69,0.5],[71,1.5],[64,0.5],[68,0.5],[71,0.5],[72,1.5],[64,0.5],[76,0.5],[75,0.5],[76,0.5],[75,0.5],[76,0.5],[71,0.5],[74,0.5],[72,0.5],[69,1.5],[60,0.5],[64,0.5],[69,0.5],[71,1.5],[64,0.5],[72,0.5],[71,0.5],[69,2]]],
  morning_mood: ["Morning Mood (Grieg)", 0.5, [[79,0.5],[76,0.5],[74,0.5],[72,0.5],[74,0.5],[76,0.5],[79,0.5],[76,0.5],[74,0.5],[72,0.5],[74,0.25],[76,0.25],[74,0.25],[76,0.25],[79,0.5],[76,0.5],[79,0.5],[81,0.5],[76,0.5],[81,0.5],[79,0.5],[76,0.5],[74,0.5],[72,1.5]]],
  mary_lamb: ["Mary Had a Little Lamb (traditional)", 0.4, [[64,1],[62,1],[60,1],[62,1],[64,1],[64,1],[64,2],[62,1],[62,1],[62,2],[64,1],[67,1],[67,2],[64,1],[62,1],[60,1],[62,1],[64,1],[64,1],[64,1],[64,1],[62,1],[62,1],[64,1],[62,1],[60,4]]],
};

// name: [what the Event Maker calls it, octave shift in semitones, how fast a note dies
// away, how fast it starts, its partials as [multiple of the note, loudness]].
export const INSTRUMENTS = {
  music_box: ["A music box", 12, 5.0, 0.002, [[1.0,1.0],[2.0,0.35],[3.0,0.12],[5.4,0.08]]],
  bell: ["Small bells", 0, 3.0, 0.002, [[1.0,1.0],[2.0,0.6],[2.76,0.4],[5.4,0.25],[8.93,0.1]]],
  harp: ["A harp", 0, 4.0, 0.003, [[1.0,1.0],[2.0,0.5],[3.0,0.25],[4.0,0.12],[5.0,0.06]]],
  piano: ["A piano", 0, 3.5, 0.004, [[1.0,1.0],[2.0,0.6],[3.0,0.3],[4.0,0.2],[5.0,0.1],[6.0,0.05]]],
  flute: ["A flute", 12, 1.5, 0.05, [[1.0,1.0],[2.0,0.15],[3.0,0.05]]],
  chimes: ["Wind chimes", 12, 2.0, 0.002, [[1.0,1.0],[2.76,0.5],[5.4,0.3]]],
};

export const TAIL = 0.7;          // seconds a last note rings on after its beat
export const PEAK = 0.8;          // every fragment and every whole tune is set to this loudness

export const tuneNames = () => Object.keys(TUNES);
export const notesOf = (tune) => TUNES[tune][2];
export const frequency = (midi) => 440.0 * Math.pow(2.0, (midi - 69) / 12.0);

// The waveform of `count` notes of a tune from note `start`, on an instrument, as
// [left, right] for addMade. count null: to the end of the tune.
export function render(tune, instrument, start = 0, count = null) {
  const [, beat, notes] = TUNES[tune];
  const [, shift, decay, attack, partials] = INSTRUMENTS[instrument];
  let part = count === null ? notes.slice(start) : notes.slice(start, start + count);
  if (!part.length) part = notes.slice(0, 1);
  let beats = 0;
  for (const [, b] of part) beats += b;
  const total = beats * beat + TAIL;
  const out = new Float64Array(Math.trunc(SR * total) + 1);
  let at = 0.0;
  for (const [midi, b] of part) {
    const n = Math.trunc(SR * (b * beat + TAIL));
    const f = frequency(midi + shift);
    const k = Math.trunc(at * SR);
    const rise = Math.max(attack, 1e-4);
    for (let i = 0; i < n && k + i < out.length; i++) {
      const t = i / SR;
      let w = 0.0;
      for (const [mult, amp] of partials) w += amp * Math.sin(2 * Math.PI * f * mult * t);
      out[k + i] += w * Math.min(1.0, t / rise) * Math.exp(-t * decay);
    }
    at += b * beat;
  }
  let peak = 1e-9;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = PEAK / peak * I16;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return [out, out];
}

// The tune cut into consecutive pieces of `fewest` to `most` notes each, as
// [start, count] pairs, from its first note to its last.
export function split(tune, fewest, most) {
  const notes = notesOf(tune);
  const out = [];
  let at = 0;
  while (at < notes.length) {
    const n = Math.min(randint(Math.min(fewest, most), Math.max(fewest, most)), notes.length - at);
    out.push([at, n]);
    at += n;
  }
  return out;
}

// The tune cut into n consecutive pieces as nearly equal as can be, as [start, count]
// pairs. Never more pieces than notes.
export function pieces(tune, n) {
  const notes = notesOf(tune);
  n = Math.max(1, Math.min(n, notes.length));
  const out = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.floor((notes.length - at) / (n - i));
    out.push([at, size]);
    at += size;
  }
  return out;
}
