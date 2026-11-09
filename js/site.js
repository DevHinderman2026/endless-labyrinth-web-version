// Shared by the website's pages (not the play page): the site links at the top,
// the footer at the bottom, the contact address, and the note for Windows
// computers. Each page carries an empty <nav class="site" data-page="..."> and an
// empty <footer class="site">, and this script fills them from the one list
// below, so a new page is added here once and appears on every page.
//
// On a narrow screen (a phone, or a small window) the links fold behind a
// button, "Site links menu", which tells a screen reader whether it is expanded
// or collapsed. Folding goes by the width of the screen, never by the kind of
// device, so a phone held sideways or a tablet in a narrow window gets the right
// layout. On a wide screen every link shows.

import { deviceKind } from './device.js';
import { applyDisplay, followDisplay } from './display.js';
import { freshen } from './version.js';

// The site links, in order. Each page is added here when it is built.
export const NAV = [
  ['index.html', 'Home'],
  ['play.html', 'Play'],
  ['about.html', 'About and how to play'],
  ['help.html', 'Help'],
  ['story.html', 'The Story of the Game'],
  ['credits.html', 'Credits'],
  ['history.html', 'Update History'],
  ['events.html', 'Events'],
  ['stats.html', 'Game Stats'],
  ['backups.html', 'Score Backups'],
  ['accessibility.html', 'Accessibility'],
];

// The footer's links: the pages people need less often.
export const FOOTER_LINKS = [
  ['terms.html', 'Terms of Use'],
  ['privacy.html', 'Privacy Policy'],
  ['accessibility-statement.html', 'Accessibility Statement'],
];

const user = ['russell', 'hinderman', '425'].join('');
const domain = ['gmail', 'com'].join('.');

function contactLink() {
  const a = document.createElement('a');
  a.href = 'mailto:' + user + '@' + domain;
  a.textContent = user + '@' + domain;
  return a;
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

function currentPage() {
  const nav = document.querySelector('nav.site');
  if (nav && nav.dataset.page) return nav.dataset.page;
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.replace(/\.html$/, '');
}

function linkList(links, current) {
  const ul = el('ul');
  for (const [href, label] of links) {
    const a = el('a', { href, text: label });
    if (href.replace(/\.html$/, '') === current) a.setAttribute('aria-current', 'page');
    ul.append(el('li', {}, [a]));
  }
  return ul;
}

export function buildNav() {
  const nav = document.querySelector('nav.site');
  if (!nav) return;
  const current = currentPage();
  const list = linkList(NAV, current);
  list.id = 'site-links';
  const button = el('button', { type: 'button', class: 'menu-toggle', 'aria-expanded': 'false', 'aria-controls': 'site-links', text: 'Site links menu' });
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav.replaceChildren(button, list);
  if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Site');
}

// Share buttons (web 1.1.0, Russell's choice): tap to share. Each button opens
// that service's own share page, in a new tab, with this site's link filled in.
// None of the services' code is loaded with the page: it runs only when a visitor
// taps that service's button, so the services see only visitors who choose to
// share. (Facebook's and X's embeddable buttons would load their code with every
// page, and Facebook's needs a developer app; the share pages need neither.)
export const SHARE_TEXT = 'Endless Labyrinth: a 3D audio game played by ear with headphones, in the browser of a phone, tablet or computer.';
// The link that is shared: this page, without a #section or ?query (web 1.1.1).
export function pageLink() { return location.origin + location.pathname; }

export function shareTargets(url = pageLink(), text = SHARE_TEXT) {
  const u = encodeURIComponent(url); const t = encodeURIComponent(text);
  return [
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['X (Twitter)', `https://twitter.com/intent/post?url=${u}&text=${t}`],
    ['Reddit', `https://www.reddit.com/submit?url=${u}&title=${encodeURIComponent('Endless Labyrinth: a 3D audio game played by ear')}`],
    ['WhatsApp', `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`],
    ['Email', `mailto:?subject=${encodeURIComponent('Endless Labyrinth')}&body=${encodeURIComponent(text + '\n' + url)}`],
  ];
}

function shareBlock() {
  const nav = el('nav', { 'aria-label': 'Share this site', class: 'share' });
  const ul = el('ul');
  for (const [name, href] of shareTargets()) {
    const a = el('a', { href, text: `Share on ${name}` });
    if (!href.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    ul.append(el('li', {}, [a]));
  }
  const status = el('p', { class: 'share-status', 'aria-live': 'polite' });
  const copy = el('button', { type: 'button', class: 'share-button', text: 'Copy the link' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageLink());
      status.textContent = 'Link copied.';
    } catch (e) {
      status.textContent = 'The link could not be copied; it is ' + pageLink();
    }
  });
  ul.append(el('li', {}, [copy]));
  if (typeof navigator !== 'undefined' && navigator.share) {
    const more = el('button', { type: 'button', class: 'share-button', text: 'Share using your device' });
    more.addEventListener('click', async () => {
      try { await navigator.share({ title: 'Endless Labyrinth', text: SHARE_TEXT, url: pageLink() }); status.textContent = 'Shared.'; } catch (e) { if (!(e && e.name === 'AbortError')) status.textContent = 'Sharing did not work here.'; }
    });
    ul.append(el('li', {}, [more]));
  }
  nav.append(ul, status);
  return nav;
}

export function buildFooter() {
  const footer = document.querySelector('footer.site');
  if (!footer) return;
  const parts = [
    el('h2', { text: 'Contact' }),
    el('p', {}, ['Endless Labyrinth is made by Russell Hinderman (DevHinderman2026). Questions, ideas or problems: ', contactLink(), '.']),
    el('p', { text: 'Copyright 2026 Russell Hinderman. All rights reserved. The game is AI assisted: written with Claude, by Anthropic, under Russell\'s direction.' }),
  ];
  if (FOOTER_LINKS.length) {
    // No heading of its own (web 1.1.1): the links sit under the contact lines.
    parts.push(el('nav', { 'aria-label': 'Site information', class: 'footer-links' }, [linkList(FOOTER_LINKS, currentPage())]));
  }
  parts.push(el('h2', { text: 'Share this site' }), shareBlock());
  footer.replaceChildren(...parts);
}

// Any page that still carries the contact address in its own text.
for (const node of document.querySelectorAll('[data-contact]')) node.replaceChildren(contactLink());

// An old kept copy of this page opens itself afresh once (js/version.js).
freshen();
applyDisplay();
followDisplay();
const kind = deviceKind();
document.documentElement.dataset.device = kind;
const note = document.getElementById('computer-note');
if (note && kind === 'windows') note.hidden = false;

buildNav();
buildFooter();
