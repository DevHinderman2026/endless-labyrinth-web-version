// The Help page (web 1.3.0, Russell's design): the game's whole help menu, built
// from the game's own help (game.js HELP), so the page and the game always match.
// The topics come in the game's order, after the frequently asked questions (in
// help.html itself). Each topic is a button that opens and closes it, with a
// screen reader hint saying what it holds; once open, its subtopics follow, each
// under its own heading. A subtopic with a sound has a Play button, which plays it
// as the game's help does, in the same room. Sounds are read from the packs one at
// a time (packs.js openPacks), or from the game's own copy if it has one.
//
// The wording matches the device, as the game's does: gestures on a phone or
// tablet, keys on a computer (Windows included, which reads the site).

import { HELP, helpRoomFor } from './game.js';
import { keyWords } from './keywords.js';
import { deviceKind, isComputer } from './device.js';
import { AudioEngine } from './audio.js';
import { openPacks } from './packs.js';
import { makeSounds as makeUltimateSounds } from './modes/ultimate.js';

const $ = (id) => document.getElementById(id);
const kind = deviceKind();
export const KEYBOARD = isComputer(kind) || kind === 'windows';
const words = (t) => (KEYBOARD ? keyWords(t) : t);

export const slug = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

// A sentence ends with one stop: a title that already ends in ? or ! keeps its own.
const stop = (s) => s.replace(/([?!.])\.$/, '$1');

// The hint for a topic's button, opened or closed.
export function topicHint(name, items, open) {
  if (open) return `Closes the ${name} subtopics.`;
  const n = items.length;
  const demos = items.filter((i) => i.sound).length;
  const what = demos === n ? `${n} sound demo${n === 1 ? '' : 's'}, each with a Play button`
    : `${n} subtopic${n === 1 ? '' : 's'}` + (demos ? `, ${demos} of them with a Play button` : '');
  const span = n > 1 ? `, from ${words(items[0].title)} to ${words(items[n - 1].title)}` : `: ${words(items[0].title)}`;
  return stop(`Opens ${what}${span}.`);
}

function setOpen(section, open) {
  const button = section.querySelector('button.topic-toggle');
  const panel = $(button.getAttribute('aria-controls'));
  const hint = $(button.getAttribute('aria-describedby'));
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.hidden = !open;
  if (hint.dataset.open) hint.textContent = open ? hint.dataset.close : hint.dataset.open;
}

function isOpen(section) { return section.querySelector('button.topic-toggle').getAttribute('aria-expanded') === 'true'; }

function topicSection(name, items) {
  const id = 'help-' + slug(name);
  const panelId = id + '-panel';
  const hintId = id + '-hint';
  const button = el('button', { class: 'topic-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-describedby': hintId, text: words(name) });
  const closed = topicHint(words(name), items, false);
  const hint = el('span', { id: hintId, class: 'sr-hint', 'data-open': closed, 'data-close': topicHint(words(name), items, true), text: closed });
  const panel = el('div', { id: panelId, class: 'topic-panel' });
  panel.hidden = true;
  const seen = new Set();
  for (const item of items) {
    let sid = slug(name) + '--' + slug(item.title);
    while (seen.has(sid)) sid += '-2';
    seen.add(sid);
    panel.append(el('h3', { id: sid, tabindex: '-1', text: words(item.title) }));
    panel.append(el('p', { text: words(item.desc) }));
    if (item.sound) {
      const play = el('button', { class: 'play', type: 'button', 'aria-describedby': 'play-hint', 'data-sound': item.sound, 'data-section': name, text: `Play: ${words(item.title)}` });
      play.addEventListener('click', () => playDemo(play, name, item));
      panel.append(el('p', {}, [play]));
    }
  }
  const section = el('section', { class: 'help-topic', id }, [el('h2', {}, [button]), hint, panel]);
  button.addEventListener('click', () => setOpen(section, !isOpen(section)));
  return section;
}

// ------------------------------------------------------------ the demos
let audio = null;
let ready = null;       // the packs, attached
let current = null;
let watcher = null;

function status(text) {
  $('demo-bar').hidden = false;
  $('demo-status').textContent = text;
}

function stopDemo(say = true) {
  if (current) { try { current.stop(); } catch (e) { /* already over */ } }
  current = null;
  clearInterval(watcher);
  watcher = null;
  $('demo-stop').hidden = true;
  if (say) status('Stopped.');
}

async function playDemo(button, section, item) {
  // Sound may start only straight from a press, so the engine is made and woken
  // here, before anything is waited for.
  if (!audio) { audio = new AudioEngine(); audio.unlock(); } else audio.resume();
  stopDemo(false);
  const title = words(item.title);
  status(`Getting ${title} ready.`);
  try {
    if (!ready) ready = openPacks().then((packs) => audio.attach(packs));
    await ready;
    // Ultimate Test Mode's own tones are made by the game, not read from a pack.
    makeUltimateSounds(audio);
    const room = helpRoomFor(section);
    if (room) await audio.prepareRoom(room);
    audio.setRoom(room);
    const buf = await audio.prepare(item.sound);
    if (!buf) throw new Error('missing');
    current = audio.play(item.sound);
    if (!current) throw new Error('missing');
  } catch (e) {
    ready = null;
    console.warn(e);
    status('That sound could not be played. Check your internet connection and try again.');
    return;
  }
  const voice = current;
  status(`Playing: ${title}.`);
  $('demo-stop').hidden = false;
  watcher = setInterval(() => {
    if (voice !== current) return;
    if (!audio.live.has(voice)) { current = null; clearInterval(watcher); watcher = null; $('demo-stop').hidden = true; status(`Finished: ${title}.`); }
  }, 250);
}

// ------------------------------------------------------------ the page
export function buildHelp() {
  const topics = $('topics');
  for (const [name, items] of HELP) topics.append(topicSection(name, items));

  // The frequently asked questions, already on the page: its hint's numbers.
  const faqHint = $('faq-hint');
  const qs = [...document.querySelectorAll('#faq-panel h3')].map((h) => h.textContent);
  const fill = (t) => stop(t.replace('{n}', qs.length).replace('{first}', qs[0]).replace('{last}', qs[qs.length - 1]));
  faqHint.dataset.open = fill(faqHint.dataset.open);
  faqHint.textContent = faqHint.dataset.open;
  const faq = $('faq');
  faq.querySelector('button.topic-toggle').addEventListener('click', () => setOpen(faq, !isOpen(faq)));

  // Open every topic, or close them all.
  const all = $('open-all');
  const allHint = $('open-all-hint');
  const openHint = allHint.textContent;
  all.addEventListener('click', () => {
    const sections = [...document.querySelectorAll('section.help-topic')];
    const open = !sections.every(isOpen);
    for (const s of sections) setOpen(s, open);
    all.textContent = open ? 'Close every topic' : 'Open every topic';
    allHint.textContent = open ? 'Closes every topic, back to the list of topics.' : openHint;
  });
  $('demo-stop').addEventListener('click', () => stopDemo(true));

  // A link to a topic or a subtopic (help.html#faq, or the old FAQ page) opens it.
  const go = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const section = target.closest('section.help-topic');
    if (section && !isOpen(section)) setOpen(section, true);
    const focus = target.matches('section') ? target.querySelector('button.topic-toggle') : target;
    if (focus.tagName === 'H3' && !focus.hasAttribute('tabindex')) focus.setAttribute('tabindex', '-1');
    focus.focus();
    target.scrollIntoView();
  };
  window.addEventListener('hashchange', go);
  go();
}

if (typeof document !== 'undefined' && document.getElementById('topics')) buildHelp();
