// The play page: start the sound, load the packs, ask for the screen reader to be
// turned off, then hand every gesture to the game.

import { AudioEngine } from './audio.js';
import { Speech } from './speech.js';
import { Store } from './storage.js';
import { Gestures } from './gestures.js';
import { Game } from './game.js';
import { deviceKind, isApple, isComputer, keyboardDevice, screenReaderName, deviceWord, windowsOnly } from './device.js';
import { keyWords } from './keywords.js';
import { applyDisplay, followDisplay } from './display.js';

const $ = (id) => document.getElementById(id);
const kind = deviceKind();
document.documentElement.dataset.device = kind;
applyDisplay();   // the display options chosen on the Accessibility page (web 1.1.0)
followDisplay();

const shown = $('said');
const statusLine = $('status');
const store = new Store();
const keyboard = keyboardDevice();
const speech = new Speech({ show: (t) => { shown.textContent = t; }, rateLevel: store.settings.speechRate, words: keyboard ? keyWords : null });
let audio = null;
let game = null;
let ready = false;      // sounds loaded, waiting for the swipe up
let started = false;

function setText(id, text) { $(id).textContent = text; }

if (windowsOnly()) {
  // Web 2.0.0: a Windows computer plays Ultimate Test Mode, the one mode the
  // Windows game does not have; the rest of the game is the Windows version.
  setText('lead', 'On a Windows computer, this web version plays Ultimate Test Mode: the hardest mode in the game, in binaural 3D sound, made for the web alone. '
    + 'The other modes and the events are played in the full Windows version of Endless Labyrinth, which you can download from the Releases page of the game\'s GitHub repository (the link is at the bottom of this page). '
    + 'Press Start to load the sounds.'
    + (/Firefox\//.test(navigator.userAgent) ? ' Firefox should work, but Chrome, Edge or Safari is recommended: those are the browsers the game is tested with.' : ''));
  const note = document.getElementById('windows-note');
  if (note) note.hidden = false;
} else if (/Firefox\//.test(navigator.userAgent) && isComputer(kind)) {
  setText('lead', $('lead').textContent + ' Firefox should work, but Chrome, Edge or Safari is recommended: those are the browsers the game is tested with.');
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
  if (kind === 'mac') {
    return 'Now turn VoiceOver off with Command F5. The game speaks for itself, with your Mac\'s own voice. '
      + 'When VoiceOver is off, press Enter to begin. When you leave the game, turn VoiceOver back on the same way.';
  }
  if (kind === 'chromebook') {
    return 'Now turn ChromeVox off with Control Alt Z. The game speaks for itself. '
      + 'When ChromeVox is off, press Enter to begin. When you leave the game, turn ChromeVox back on the same way.';
  }
  if (kind === 'windows') {
    // The keys confirmed on 8 November 2026 in NV Access's NVDA User Guide and
    // Freedom Scientific's JAWS keystroke list.
    return 'Now turn your screen reader\'s speech off. With NVDA, press the NVDA key plus S, which cycles the speech mode off and back on. '
      + 'With JAWS, press Insert plus Space, then S, which switches between full speech and speech on demand (Caps Lock plus Space, then S, in the laptop layout); the same again turns full speech back on. '
      + 'The game speaks for itself, with your computer\'s own voice. When your screen reader is quiet, press Enter to begin. When you leave the game, turn its speech back on the same way.';
  }
  if (keyboard) {
    return 'Now turn your screen reader off; with Orca, press Super Alt S. The game speaks for itself. '
      + 'When your screen reader is off, press Enter to begin. When you leave the game, turn it back on the same way.';
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
      ? (keyboard
        ? 'Your browser cannot play the game\'s sounds. Update your browser; on a Mac, update to macOS with Safari 18.4 or newer, or use Chrome.'
        : 'Your browser cannot play the game\'s sounds. On an iPhone or iPad, update to iOS 18.4 or newer. On Android, update Chrome.')
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
