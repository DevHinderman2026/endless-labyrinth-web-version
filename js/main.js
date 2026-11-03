// The play page: start the sound, load the packs, ask for the screen reader to be
// turned off, then hand every gesture to the game.

import { AudioEngine } from './audio.js';
import { Speech } from './speech.js';
import { Store } from './storage.js';
import { Gestures } from './gestures.js';
import { Game } from './game.js';
import { deviceKind, isApple, screenReaderName, deviceWord, allowComputer } from './device.js';

const $ = (id) => document.getElementById(id);
const kind = deviceKind();
document.documentElement.dataset.device = kind;

const shown = $('said');
const statusLine = $('status');
const store = new Store();
const speech = new Speech({ show: (t) => { shown.textContent = t; }, rateLevel: store.settings.speechRate });
let audio = null;
let game = null;
let ready = false;      // sounds loaded, waiting for the swipe up
let started = false;

function setText(id, text) { $(id).textContent = text; }

if (kind === 'computer' && !allowComputer()) {
  $('start').hidden = true;
  setText('lead', 'This web version of Endless Labyrinth works only on phones and tablets: an iPhone, an iPad, or an Android phone or tablet. Computers are not supported, including Windows, Mac, Linux and Chromebooks, because Endless Labyrinth already has a full Windows version for computers. On a Windows computer, download it from the Releases page of the game\'s GitHub repository. On an Android tablet, open Chrome\'s menu, turn off Desktop site, and reload this page.');
}

function offInstructions() {
  const sr = screenReaderName(kind);
  if (isApple(kind)) {
    return `Make sure your ${deviceWord(kind)} is not in silent mode, or the game's sounds will be muted. `
      + `Now turn ${sr} off: triple-click the side button, or the Home button on older models, `
      + `if your Accessibility Shortcut is set up, or ask Siri to turn ${sr} off. `
      + `The game speaks for itself. When ${sr} is off, swipe up anywhere on the screen to begin. `
      + `When you leave the game, turn ${sr} back on the same way.`;
  }
  if (kind.startsWith('android')) {
    return `Now turn ${sr} off: hold both volume keys for three seconds, if that shortcut is set up, `
      + `or ask your assistant to turn ${sr} off. The game speaks for itself. `
      + `When ${sr} is off, swipe up anywhere on the screen to begin. When you leave the game, turn ${sr} back on the same way.`;
  }
  return 'The game speaks for itself. Turn your screen reader off, then swipe up anywhere on the screen, or press Enter, to begin.';
}

async function start() {
  if (audio) return;
  $('start').disabled = true;
  // Sound and speech are both started inside the press itself: phones allow them
  // to begin only straight from a touch.
  speech.speak('Endless Labyrinth. Loading sounds.', { now: true });
  audio = new AudioEngine();
  await audio.unlock();
  setText('lead', 'Loading sounds. The first time takes a moment; after that they are kept on your ' + deviceWord(kind) + '.');
  let lastSaid = 0;
  try {
    await audio.load((frac, cached) => {
      const pct = Math.floor(frac * 100);
      setText('progress', cached ? 'Sounds ready.' : `Loading sounds: ${pct} percent.`);
      const now = performance.now();
      if (!cached && now - lastSaid > 4000 && pct > 0 && pct < 100) {
        lastSaid = now;
        speech.speak(`${pct} percent.`, { interrupt: false });
      }
    });
  } catch (e) {
    console.error(e);
    const msg = /decode|Decod|EncodingError|Unable/.test(String(e && (e.name + e.message)))
      ? 'Your browser cannot play the game\'s sounds. On an iPhone or iPad, update to iOS 18.4 or newer. On Android, update Chrome.'
      : 'The sounds could not be loaded. Check your internet connection and try again.';
    setText('lead', msg);
    speech.speak(msg);
    $('start').disabled = false;
    audio = null;
    return;
  }
  setText('progress', '');
  const text = 'Sounds loaded. ' + offInstructions();
  setText('lead', text);
  speech.speak(text);
  ready = true;
}

// An earlier version kept a list of problems on the phone, for testing; it is no
// longer kept, so any left behind is cleared.
try { localStorage.removeItem('endless-labyrinth-web-errors'); } catch (e) { /* storage blocked */ }

function begin() {
  if (!ready || started) return;
  started = true;
  document.body.classList.add('playing');
  $('intro').hidden = true;
  game = new Game({
    audio, speech, store, gestures,
    view: (s) => { if (statusLine.textContent !== s) statusLine.textContent = s; },
    leave: () => { location.href = 'index.html'; },
  });
  audio.wake();
  game.welcome();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    try { game.frame(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Every touch, tap and key press wakes the sound if the phone has stopped it:
// these are the moments a phone allows sound to start again.
for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
  document.addEventListener(type, () => { if (audio) audio.wake(); }, { capture: true, passive: true });
}

const gestures = new Gestures($('stage'), (g) => {
  if (audio) audio.resume();
  if (!started) {
    if (g === 'up' || (g === 'enter' && ready)) begin();
    return;
  }
  game.input(g);
});

$('start').addEventListener('click', start);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (game) game.autoPause(); }
  else if (audio) audio.resume();
});

// For the tests: the running game, when there is one.
window.__el = { get game() { return game; }, get audio() { return audio; }, speech };
