// The Accessibility page (web 1.1.0): the display options (saved with the game's
// settings), and the setup guide for the reader's own device, named by the
// device check, with every other device's guide below it.

import { Store } from './storage.js';
import { applyDisplay, readDisplay, TEXT_SIZES } from './display.js';
import { deviceKind, screenReaderName, deviceWord } from './device.js';

const $ = (id) => document.getElementById(id);

// Which guide section fits which kind of device.
export const GUIDE_FOR = { iphone: 'ios', ipad: 'ios', 'android-phone': 'android', 'android-tablet': 'android', chromebook: 'chromebook', mac: 'mac', linux: 'linux', windows: 'windows' };

// The one-paragraph answer for this device: which screen reader reads the site,
// and that it goes off while playing.
export function deviceAdvice(kind) {
  const sr = screenReaderName(kind);
  const word = deviceWord(kind);
  const on = {
    iphone: 'turn VoiceOver on in Settings, Accessibility, VoiceOver, or ask Siri to turn VoiceOver on',
    ipad: 'turn VoiceOver on in Settings, Accessibility, VoiceOver, or ask Siri to turn VoiceOver on',
    'android-phone': 'turn TalkBack on in Settings, Accessibility, TalkBack, or hold both volume keys for three seconds',
    'android-tablet': 'turn TalkBack on in Settings, Accessibility, TalkBack, or hold both volume keys for three seconds',
    chromebook: 'turn ChromeVox on with Control Alt Z',
    mac: 'turn VoiceOver on with Command F5',
    linux: 'turn Orca on with Super Alt S',
  }[kind];
  if (kind === 'windows') {
    return 'You are on a Windows computer. This website reads with your screen reader as any website does. The game plays Ultimate Mode here, with the keyboard, and speaks for itself with your computer\'s own voice, so quiet NVDA\'s or JAWS\'s speech while you play; the game tells you how at the start. A Braille display and a Braille keyboard work with it, through NVDA or JAWS, as in the Windows version: the game keeps the keyboard focus in a game area of its own and shows what it says there on the display. For every other mode, play the full Windows version, which works with NVDA and JAWS and with a Braille display.';
  }
  const a = /^[aeiou]/i.test(word) ? 'an' : 'a';
  return `You are on ${a} ${word}. ${sr} reads this website for you: if it is not on, ${on}. The game is different: it speaks for itself with your ${word}'s own voice, so turn ${sr} off while you play and back on when you leave. The game tells you how at the start of every session.`;
}

function saveDisplay(display) {
  const store = new Store();
  if (store.readFailed) return false;
  store.settings.display = { contrast: display.contrast, text: display.text };
  return store.save();
}

export function showAccessibility() {
  const kind = deviceKind();
  $('device-advice').textContent = deviceAdvice(kind);
  // The reader's own guide first, marked as theirs.
  const mine = $('guide-' + GUIDE_FOR[kind]);
  if (mine) {
    const h = mine.querySelector('h3');
    h.textContent = h.textContent + ' (your device)';
    mine.parentNode.prepend(mine);
  }
  $('wrong-device').textContent = `Not ${/^[aeiou]/i.test(deviceWord(kind)) ? 'an' : 'a'} ${deviceWord(kind)}? Every device's guide is below.`;

  // Display options.
  const current = readDisplay();
  const contrast = $('contrast');
  const text = $('text-size');
  contrast.checked = current.contrast === 'high';
  text.value = current.text;
  const status = $('display-status');
  const apply = () => {
    const display = { contrast: contrast.checked ? 'high' : 'normal', text: TEXT_SIZES.includes(text.value) ? text.value : 'normal' };
    applyDisplay(display);
    const saved = saveDisplay(display);
    status.textContent = saved
      ? `Saved: ${display.contrast === 'high' ? 'high contrast' : 'normal colors'}, ${display.text} text. These apply on every page and in the game, on this device.`
      : 'Applied for now, but your browser is not letting the game save, so these will not be kept.';
  };
  contrast.addEventListener('change', apply);
  text.addEventListener('change', apply);
}

if (typeof document !== 'undefined' && $('device-advice')) showAccessibility();
