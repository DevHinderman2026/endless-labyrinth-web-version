import { deviceKind, isComputer, keyboardDevice } from '../../device.js';

// The words of an event's description, for the device it is read on.
//
// Event descriptions are written for a keyboard (they are signed, so they are
// never changed). Spoken here, the keys they name become the phone's gestures
// (Russell's decision); event help explains any wording this does not know.
// A double tap's report already says the time left, so "T" goes.
const GESTURE_WORDS = [
  [/\bwith the arrow keys\b/g, 'by swiping'],
  [/\bPress the arrow toward it\b/g, 'Swipe toward it'],
  [/\bThe wrong arrow\b/g, 'The wrong swipe'],
  [/\bLeft and Right turn you and take a step\b/g, 'Swipes left and right turn you and take a step'],
  [/\bwith Up or Down\b/g, 'with a swipe up or down'],
  [/\bEnter tells you\b/g, 'A double tap tells you'],
  [/,? and T the time( left)?/g, ' and the time$1'],
  [/\bwith the laser on Space\b/g, 'with the laser, a two-finger tap'],
  [/\bwith Space\b/g, 'with a two-finger tap'],
  [/\bPress Space\b/g, 'Tap with two fingers'],
  [/\bpress Space\b/g, 'tap with two fingers'],
  [/\bpressing off the beat\b/g, 'tapping off the beat'],
];
export function gestureWords(text, keyboard = (typeof navigator !== 'undefined' && keyboardDevice())) {
  // On a computer the keyboard's own words are kept, as written.
  if (keyboard) return text;
  let t = text;
  for (const [re, to] of GESTURE_WORDS) t = t.replace(re, to);
  return t;
}



// For the website's pages: a Windows computer cannot play, but it reads the site,
// so it gets the keyboard's words too (web 1.1.0).
export function siteWords(text) {
  const kind = deviceKind();
  return gestureWords(text, isComputer(kind) || kind === 'windows');
}
