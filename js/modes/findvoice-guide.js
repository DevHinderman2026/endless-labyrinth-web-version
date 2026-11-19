// Find the Voice (web 6.0.0): the guide's calls.
//
// The guide speaks with Kokoro's Heart voice (af_heart), her calling phrases
// rendered ahead into one-channel AudioBuffers by the voice module (agent
// "voice": js/bella*.js and the shared guide phrases file). This file is the one
// place the mode asks for a call, so the voice module is wired in here and
// nowhere else:
//
//   setGuideSource(source)
//
// The source is the voice module's GuideVoice (js/bella.js: its `available`,
// next(), prepare() and release() are used as they are), or anything with
// ready() and next() -> { buffer, text, id }. next() hands over the next call,
// never one just heard (the source keeps its own order). Until a
// source is set, or while it is not ready (still downloading, offline, or the
// device struggling), getGuideCall() gives { buffer: null, text } from the
// phrases below, and the mode speaks the text with the device's own voice (not
// placed) and plays a placed beacon at her spot, so she can still be found.

// A few of the guide's calling phrases, for the device's voice while Heart is not
// available. (The full list of 300 and more lives in the shared guide phrases file;
// the voice module reads it.)
export const FALLBACK_PHRASES = [
  'Over here.', 'This way.', 'Follow my voice.', 'I am over here.', 'Come to me.', 'Keep coming.',
  'You are close.', 'Can you hear me?', 'Here!', 'Over this way.', 'Find me.', 'I am waiting for you.',
  'Come on, this way.', 'Listen for me.', 'Right here.', 'Walk toward my voice.', 'Not far now.',
  'I am calling you.', 'Hurry, over here.', 'Quickly, this way.', 'Can you find me?', 'Here I am.',
  'Follow me.', 'Come closer.', 'I am right here.', 'Over here, can you hear?', 'This way, quickly.',
  'Keep walking.', 'Turn toward me.', 'I am this way.',
];

let source = null;
let bag = [];
let last = -1;

export function setGuideSource(s) { source = s || null; }

// Whether Heart's calls are being played (for the tests and the help demos).
export function guideVoiceReady() {
  try {
    if (!source) return false;
    if (typeof source.ready === 'function') return !!source.ready();
    return !!source.available;
  } catch (e) { return false; }
}

// A run begins (Heart's calls made ahead, a dozen at a time) or ends (let go).
export function guideRunStarts() { try { if (source && source.prepare) source.prepare(12); } catch (e) { /* the device's voice */ } }
export function guideRunEnds() { try { if (source && source.release) source.release(); } catch (e) { /* nothing held */ } }

// The next call: { buffer: AudioBuffer | null, text, id }. Never the same phrase
// twice running; the fallback goes through every phrase before any comes again.
export function getGuideCall() {
  if (guideVoiceReady()) {
    try {
      const c = source.next();
      if (c && c.buffer) return { buffer: c.buffer, text: c.text || '', id: c.id !== undefined ? String(c.id) : null };
      // (None made yet: her phrase, said by the device's voice.)
      if (c && c.text) return { buffer: null, text: c.text, id: null };
    } catch (e) { /* the device's voice, below */ }
  }
  if (!bag.length) {
    bag = FALLBACK_PHRASES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    if (bag[bag.length - 1] === last && bag.length > 1) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  const i = bag.pop();
  last = i;
  return { buffer: null, text: FALLBACK_PHRASES[i], id: null };
}

// A line you find your way by (the guide's call, a safe zone character's greeting
// or call-back) said by the device's own voice, when its Kokoro voice is not
// available. Russell (19 Nov): anything located by voice is ALWAYS heard, whatever
// the Speech setting, so with the voice silenced for Braille it is said here,
// straight through the browser's speech; otherwise it joins the game's own queue,
// after whatever is being said, on the device's voice (never Bella's).
export function sayLocatable(tts, text) {
  if (!tts || !text) return;
  let muted = false;
  try { muted = !!(tts.muted && tts.muted()); } catch (e) { muted = false; }
  if (!muted) { tts.speak(text, { interrupt: false, device: true }); return; }
  const synth = tts.synth || (typeof window !== 'undefined' ? window.speechSynthesis : null);
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = tts.rate || 1;
    if (tts.voice) u.voice = tts.voice;
    synth.speak(u);
  } catch (e) { /* no voice on this device */ }
}
