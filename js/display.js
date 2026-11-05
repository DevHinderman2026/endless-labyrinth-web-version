// Display options for low-vision players (web 1.1.0): high contrast and bigger
// text, chosen on the Accessibility page and applied on every page, the play
// page included. They are kept with the game's other settings in this browser,
// so a backup carries them and two open copies of the game share them.

import { KEY } from './storage.js';

export const TEXT_SIZES = ['normal', 'large', 'larger'];

export function readDisplay() {
  let d = {};
  try {
    const data = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    d = (data && data.settings && data.settings.display) || {};
  } catch (e) { d = {}; }
  return { contrast: d.contrast === 'high' ? 'high' : 'normal', text: TEXT_SIZES.includes(d.text) ? d.text : 'normal' };
}

export function applyDisplay(display = readDisplay()) {
  const root = document.documentElement;
  if (display.contrast === 'high') root.dataset.contrast = 'high'; else delete root.dataset.contrast;
  if (display.text !== 'normal') root.dataset.text = display.text; else delete root.dataset.text;
}

// Two open pages: when one changes the options, the other follows.
export function followDisplay() {
  try { window.addEventListener('storage', (e) => { if (e.key === KEY) applyDisplay(); }); } catch (e) { /* none */ }
}
