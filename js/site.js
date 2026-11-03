// Shared by the website's pages: the contact address, written into the page by
// script so robots that collect addresses from pages have a harder time with it,
// and the note for computers.

import { deviceKind } from './device.js';

const user = ['russell', 'hinderman', '425'].join('');
const domain = ['gmail', 'com'].join('.');
for (const el of document.querySelectorAll('[data-contact]')) {
  const a = document.createElement('a');
  a.href = 'mailto:' + user + '@' + domain;
  a.textContent = user + '@' + domain;
  el.replaceChildren(a);
}

const kind = deviceKind();
const note = document.getElementById('computer-note');
if (note && kind === 'windows') note.hidden = false;
