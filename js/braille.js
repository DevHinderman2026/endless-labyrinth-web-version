// Braille display and Braille keyboard support for the web version, on a Windows
// computer (web 3.0.0; reworked in 3.1.0 after Russell's test on his BrailleNote
// Evolve, 9 November 2026).
//
// The keyboard focus: NVDA and JAWS read a page in browse mode, where letters and
// arrows are their own commands and never reach the page. So on Windows the game
// keeps the keyboard focus in a game area of its own (#console, role application)
// from the moment the sounds are loaded: the screen reader stays in focus mode
// there and every key reaches the game. It is not a text box: in an editable field
// a screen reader holds Braille keyboard input until the space is pressed, so on
// the BrailleNote the letter H reached the game only after a space (3.0.0 had a
// text box); outside one, each letter is sent the moment it is brailled.
//
// The display: everything the game says becomes the game area's name, which the
// screen reader shows on the Braille display and keeps there until the next
// message (Test 1 of the 9 November test page; an announcement, Test 3, worked too
// but shows only for a moment; a Braille-only label and a read-only text box did
// not work). The screen reader also speaks a name change, which is why the game
// asks Windows players to turn their screen reader's speech off: the game speaks
// for itself. "Speech: Off" turns the game's own voice off instead, for a player
// who keeps the screen reader's speech on, or reads on the display alone.
//
// The keys: the BrailleNote sends its Braille keys exactly as a keyboard does, with
// real key codes (its Key Test said "Key h"), so a page cannot tell them apart, and
// nothing needs translating. Some screen readers instead type Braille as text with
// no key code, and in contracted Braille a letter on its own then arrives as a word
// (have for H, that for T). That text is turned back into the letter here, always:
// an ordinary keyboard never sends it, so it does no harm. There is no setting and
// no detection any more (3.0.0's Auto could never notice the BrailleNote: a browser
// cannot see a Braille display).
//
// Nothing in here does anything on a phone, a tablet, a Mac or a Chromebook.

// Contracted Braille alphabetic wordsigns: a letter on its own means one of these
// words, so a screen reader set to contracted input types the word. UEB and the
// older American EBAE code agree on every one. A, I and O are words already.
export const WORDSIGNS = {
  but: 'b', can: 'c', do: 'd', every: 'e', from: 'f', go: 'g',
  have: 'h', just: 'j', knowledge: 'k', like: 'l', more: 'm',
  not: 'n', people: 'p', quite: 'q', rather: 'r', so: 's',
  that: 't', us: 'u', very: 'v', will: 'w', it: 'x', you: 'y',
  as: 'z',
};

// Characters from one chord, or one contracted word, arrive in a quick burst. A
// gap longer than this ends the burst.
export const BURST_GAP = 80;

const CONTROL_NAMES = { Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab', ' ': 'Space' };

// The key test: the same key again within this long is the same hold (a Braille
// notetaker sends a held key as a stream of separate presses); the hold is
// reported, with how many times the key arrived and how far apart, once the stream
// has been quiet this long.
export const HOLD_REPORT_GAP = 400;

export class Braille {
  // field: the game area the game keeps focused on Windows; store: the settings;
  // emit(gesture): hands a key to the game as gestures.js does.
  constructor({ field = null, store = null, emit = () => {}, speak = () => {}, enabled = true } = {}) {
    this.field = field;
    this.store = store;
    this.emit = emit;
    this.speak = speak;
    this.enabled = enabled;              // false anywhere but a Windows computer
    this.speechOff = !!(this.enabled && store && store.settings && store.settings.speech === 'off');
    this.keyTest = false;
    this.onKeyTestEnd = null;
    this.held = null;                    // the key test: the key being held, and its arrivals
    this.buffer = '';
    this.flushTimer = null;
    this.holding = false;                // keeping the focus in the game area
    this.lastShown = '';
    if (this.field && this.enabled) {
      this.field.addEventListener('blur', () => { if (this.holding) setTimeout(() => this.focus(), 50); });
    }
  }

  // ---------------------------------------------------------------- settings
  _save() {
    if (!this.store) return;
    this.store.settings.speech = this.speechOff ? 'off' : 'on';
    this.store.save();
  }

  // The main menu entry (Windows only).
  speechLabel() { return this.speechOff ? 'Speech: Off, screen reader and Braille only' : 'Speech: On'; }

  // The game's own voice on or off: returns the sentence to speak (it is spoken
  // even when the voice is being turned off, so the player hears the change).
  toggleSpeech() {
    this.speechOff = !this.speechOff;
    this._save();
    return this.speechOff
      ? 'Speech off. The game\'s own voice is silent; everything it says still goes to your screen reader and your Braille display. Turn your screen reader\'s speech on to hear it.'
      : 'Speech on. The game speaks for itself; keep your screen reader\'s speech off so you do not hear everything twice.';
  }

  // Whether the game's own voice is silenced.
  get speechMuted() { return this.enabled && this.speechOff; }

  // ---------------------------------------------------------------- the focus and the display
  // Keep the keyboard focus in the game area (focus mode for NVDA and JAWS).
  hold(on = true) {
    this.holding = on && this.enabled && !!this.field;
    if (this.holding) this.focus();
  }

  focus() {
    if (!this.holding || !this.field) return;
    if (document.activeElement === this.field) return;
    try { this.field.focus({ preventScroll: true }); } catch (e) { /* not focusable yet */ }
  }

  // Put one message on the display: it becomes the game area's name, which the
  // screen reader shows until the next message.
  show(text) {
    if (!this.field || !this.enabled) return;
    const t = String(text || '').trim();
    if (!t || t === this.lastShown) return;
    this.lastShown = t;
    this.field.setAttribute('aria-label', t);
  }

  // ---------------------------------------------------------------- the keys
  // A key press on the page. Returns true when this file has taken it (the game
  // must not act on it), false when the game handles it as usual.
  keydown(e) {
    if (!this.enabled) return false;
    const now = performance.now();
    const key = e.key || '';
    const printable = key.length === 1;
    const codeless = !e.code;               // typed by software: a Braille driver, never a keyboard
    if (this.keyTest) {
      if (key === 'Escape') { this.endKeyTest(); e.preventDefault(); if (this.holding) setTimeout(() => this.refocus(), 60); return true; }
      if (printable && codeless) this._feed(key, now);
      else this._testKey(e, now);
      e.preventDefault();
      return true;
    }
    if (printable && codeless) {
      // Braille typed as text: it may be a wordsign ("have" for H), so it goes
      // through the burst and comes out as the letter meant.
      this._feed(key, now);
      e.preventDefault();
      return true;
    }
    // Escape can take NVDA and JAWS out of focus mode (letters would become their
    // own commands again): the focus is put back into the game area a moment
    // later, a fresh focus event, so they return to focus mode on their own.
    if (key === 'Escape' && this.holding) setTimeout(() => this.refocus(), 60);
    return false;
  }

  // Leave the game area and come straight back: a new focus event for the screen reader.
  refocus() {
    if (!this.holding || !this.field) return;
    try { this.field.blur(); } catch (e) { /* fine */ }
    setTimeout(() => this.focus(), 20);
  }

  // One character of Braille text into the burst; the burst is read BURST_GAP
  // after its last character.
  _feed(ch, now) {
    this.buffer += ch;
    this.bufferTime = now;
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this._flush(), BURST_GAP + 10);
  }

  _flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const burst = this.buffer;
    this.buffer = '';
    const word = burst.trim().toLowerCase();
    if (!word) {
      if (burst.includes(' ')) this._key(' ', 'Space');
      return;
    }
    let letter;
    if (word.length === 1) letter = word;
    else if (WORDSIGNS[word]) letter = WORDSIGNS[word];
    else {
      if (this.keyTest) this.speak(`Braille text ${word} was not understood as a key.`);
      return;
    }
    if (letter < ' ' || letter > '~') return;
    this._key(letter, word.length > 1 ? `${word}, the letter ${letter.toUpperCase()}` : letter.toUpperCase());
  }

  // A letter or a space recovered from Braille text: the game's key for it.
  _key(ch, said) {
    if (this.keyTest) { this.speak(`Braille key ${said}.`); return; }
    const g = Braille.gestureFor(ch);
    if (g) this.emit(g);
  }

  // The same keys as gestures.js's keyboard map (letters and the space).
  static gestureFor(ch) {
    return { ' ': 'space', p: 'pause', h: 'help', t: 'clock', y: 'yes', n: 'no', c: 'compass' }[ch.toLowerCase()] || null;
  }

  // ---------------------------------------------------------------- the key test
  startKeyTest(onEnd = null) {
    this.keyTest = true;
    this.onKeyTestEnd = onEnd;
    this.buffer = '';
  }

  endKeyTest() {
    clearTimeout(this.heldTimer);
    this.held = null;
    this.keyTest = false;
    this.buffer = '';
    const end = this.onKeyTestEnd;
    this.onKeyTestEnd = null;
    if (end) end();
  }

  // The key test: name a key the moment it arrives; if it keeps arriving, say so
  // once the stream stops, with how many times and how far apart.
  _testKey(e, now) {
    const id = (e.key || '') + '|' + (e.code || '');
    const h = this.held;
    if (h && h.id === id && now - h.last < HOLD_REPORT_GAP) {
      h.count += 1;
      if (e.repeat) h.repeats += 1;
      h.gaps.push(now - h.last);
      h.last = now;
    } else {
      this._reportHeld();
      this.speak(this._describeKey(e));
      this.held = { id, name: this._describeKey(e).replace(/\.$/, ''), count: 1, repeats: 0, last: now, gaps: [] };
    }
    clearTimeout(this.heldTimer);
    this.heldTimer = setTimeout(() => this._reportHeld(), HOLD_REPORT_GAP);
  }

  _reportHeld() {
    clearTimeout(this.heldTimer);
    const h = this.held;
    this.held = null;
    if (!h || h.count < 2 || !this.keyTest) return;
    const every = Math.round(h.gaps.reduce((a, b) => a + b, 0) / h.gaps.length);
    // A keyboard's own repeat is flagged as such; a notetaker's stream is not.
    const how = h.repeats === h.count - 1 ? 'as a key held down' : h.repeats === 0 ? 'as separate presses' : 'partly as separate presses';
    this.speak(`${h.name}, held: it arrived ${h.count} times, about every ${every} milliseconds, ${how}.`);
  }

  _describeKey(e) {
    const key = e.key || '';
    if (CONTROL_NAMES[key]) return `Key ${CONTROL_NAMES[key]}${e.code ? '' : ', typed'}.`;
    if (key.length === 1) return `Key ${key}${e.code ? '' : ', typed'}.`;
    if (key === 'Unidentified' || key === 'Process' || !key) return `Unknown key, code ${e.keyCode || 0}.`;
    return `Key ${key}.`;
  }
}
