// Braille keyboard and Braille display support for the web version (web 2.1.0),
// on a Windows computer: the port of the Windows game's braille_input.py.
//
// Why it is needed (the same as on Windows): on a Braille notetaker such as the
// BrailleNote Evolve, or a computer with a Braille display that has its own
// keyboard, the Braille keys do not reach the page as ordinary key presses. The
// screen reader translates each chord first and types the result as text. Arrow
// keys skip that step; letters do not. A letter on its own, in contracted (grade
// 2) Braille, is a wordsign, so H arrives as "have", T as "that", Y as "you".
// What this file does is catch what comes out the other end and turn it back into
// the key the player meant.
//
// How a browser differs from the Windows game:
// - A page cannot see the devices, so Auto detects a Braille keyboard by how the
//   keys arrive: text typed by a screen reader's Braille driver carries no key
//   code (KeyboardEvent.code is empty, or the text comes as an input event that no
//   key press announced), which an ordinary keyboard never does.
// - NVDA and JAWS read a page in browse mode, where letters and arrows are their
//   own commands and never reach the page. So on Windows the game keeps the
//   keyboard focus in a text box of its own (#console) from the moment the sounds
//   are loaded: a focused text box puts the screen reader in focus (forms) mode,
//   every key reaches the game, and the box is also the Braille display's view of
//   the game: everything the game says is written into it and stays there until
//   the next message (Russell's choice over a flashing live region), so a Braille
//   display tethered to the focus shows it and can pan through a long sentence.
// - "Speech: Off, Braille only" turns the game's own voice off (the messages still
//   go to the box). It can only be set while Braille keyboard mode is on, so a
//   player can never be left with neither speech nor Braille.
//
// Nothing in here does anything on a phone, a tablet, a Mac or a Chromebook.

export const MODES = ['auto', 'on', 'off'];
export const MODE_NAMES = { auto: 'Auto', on: 'On', off: 'Off' };

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
// How long a real key press stays on record, so the same press arriving again as
// typed text is not counted a second time.
const DEDUPE_WINDOW = 500;
// One press of Enter can reach the page twice (a key and a line break typed).
const CONTROL_DEDUPE = 120;

const CONTROL_NAMES = { Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab', ' ': 'Space' };

export class Braille {
  // field: the text box the game keeps focused on Windows; store: the settings;
  // emit(gesture): hands a key to the game as gestures.js does.
  constructor({ field = null, store = null, emit = () => {}, speak = () => {}, enabled = true } = {}) {
    this.field = field;
    this.store = store;
    this.emit = emit;
    this.speak = speak;
    this.enabled = enabled;              // false anywhere but a Windows computer
    this.mode = this._loadMode();
    this.speechOff = !!(store && store.settings && store.settings.speech === 'off');
    this.detected = false;               // text has arrived the way a Braille driver sends it
    this.keyTest = false;
    this.onKeyTestEnd = null;
    this.announcement = (this.enabled && this.mode === 'on') ? 'Braille keyboard mode is on.' : null;
    this.buffer = '';
    this.flushTimer = null;
    this.recentKeys = [];                // [char, time] from key presses with a key code
    this.recentText = [];                // [char, time] from text already fed
    this.lastControl = {};
    this.holding = false;                // keeping the focus in the field
    this.lastShown = '';
    if (this.field && this.enabled) {
      // Nothing a Braille driver or a keyboard types is ever kept in the box: the
      // box shows what the game says. The typed text is read here first.
      this.field.addEventListener('beforeinput', (e) => this._beforeInput(e));
      this.field.addEventListener('blur', () => { if (this.holding) setTimeout(() => this.focus(), 50); });
    }
  }

  // ---------------------------------------------------------------- settings
  _loadMode() {
    const m = this.store && this.store.settings && this.store.settings.brailleKeyboard;
    return MODES.includes(m) ? m : 'auto';
  }

  _save() {
    if (!this.store) return;
    this.store.settings.brailleKeyboard = this.mode;
    this.store.settings.speech = this.speechOff ? 'off' : 'on';
    this.store.save();
  }

  get active() { return this.enabled && (this.mode === 'on' || (this.mode === 'auto' && this.detected)); }

  // The main menu entries (Windows only).
  label() {
    if (this.mode === 'auto') return `Braille Keyboard: Auto, ${this.detected ? 'Braille device found' : 'no Braille device yet'}`;
    return `Braille Keyboard: ${MODE_NAMES[this.mode]}`;
  }

  speechLabel() {
    if (!this.active) return 'Speech: On, no Braille output';
    return this.speechOff ? 'Speech: Off, Braille only' : 'Speech: On';
  }

  // Auto, On, Off: returns the sentence to speak.
  cycle(step = 1) {
    this.mode = MODES[(MODES.indexOf(this.mode) + step + MODES.length) % MODES.length];
    if (!this.active && this.speechOff) this.speechOff = false;   // never silent with no Braille
    this._save();
    if (this.mode === 'on') return 'Braille keyboard, On. Braille letters and Enter are always translated.';
    if (this.mode === 'off') return 'Braille keyboard, Off. Only an ordinary keyboard is used.';
    return 'Braille keyboard, Auto. It turns itself on when a Braille device is found.';
  }

  // Speech on or off (Braille only): returns the sentence to speak (it is spoken
  // even when speech is being turned off, so the player hears the change).
  toggleSpeech() {
    if (!this.active) {
      return 'Speech stays on. No Braille output was found. Turn Braille keyboard mode on, or type a letter on your Braille keyboard so the game finds it, then try again.';
    }
    this.speechOff = !this.speechOff;
    this._save();
    return this.speechOff ? 'Speech off. Everything the game says now appears in Braille only.' : 'Speech on.';
  }

  // Whether the game's own voice is silenced: only while Braille is in use.
  get speechMuted() { return this.speechOff && this.active; }

  takeAnnouncement() { const a = this.announcement; this.announcement = null; return a; }

  describeStatus() {
    const state = this.active ? 'Braille keyboard mode is on.' : 'Braille keyboard mode is off.';
    const found = this.detected ? 'A Braille device was found by the way its keys arrive.' : 'No Braille device found yet.';
    return `${state} ${found}`;
  }

  // ---------------------------------------------------------------- the focus and the display
  // Keep the keyboard focus in the game's text box (focus mode for NVDA and JAWS).
  hold(on = true) {
    this.holding = on && this.enabled && !!this.field;
    if (this.holding) this.focus();
  }

  focus() {
    if (!this.holding || !this.field) return;
    if (document.activeElement === this.field) return;
    try { this.field.focus({ preventScroll: true }); } catch (e) { /* not focusable yet */ }
  }

  // Put one message on the display: it becomes the text box's whole content, with
  // the caret at its start so the display shows it from its first word.
  show(text) {
    if (!this.field || !this.enabled) return;
    const t = String(text || '').trim();
    if (!t || t === this.lastShown) return;
    this.lastShown = t;
    this.field.value = t;
    try { this.field.setSelectionRange(0, 0); } catch (e) { /* fine */ }
  }

  // ---------------------------------------------------------------- the keys
  // A key press on the page. Returns true when this file has taken it (the game
  // must not act on it), false when the game handles it as usual.
  keydown(e) {
    if (!this.enabled) return false;
    const now = performance.now();
    this._expire(now);
    const key = e.key || '';
    const printable = key.length === 1;
    const codeless = !e.code;               // typed by software: a Braille driver, never a keyboard
    if (this.keyTest) {
      if (key === 'Escape') { this.endKeyTest(); e.preventDefault(); if (this.holding) setTimeout(() => this.refocus(), 60); return true; }
      if (printable && codeless) { this._noteText(key, now); this._feed(key, now); }
      else this.speak(this._describeKey(e));
      e.preventDefault();
      return true;
    }
    if (printable && codeless) {
      // A Braille driver's text: it may be a wordsign ("have" for H), so it goes
      // through the burst. Any mode: this is how a Braille keyboard is found.
      if (!this.detected) {
        this.detected = true;
        if (this.mode === 'auto') this.announcement = 'Braille device detected. Braille keyboard mode is on.';
      }
      if (!this.active) return false;     // Off: the game takes the letters as they come
      this._noteText(key, now);
      this._feed(key, now);
      e.preventDefault();
      return true;
    }
    if (printable) {
      // An ordinary key: the game acts on it now; the same character typed into the
      // box right after is the same press.
      this.recentKeys.push([key.toLowerCase(), now]);
      return false;
    }
    if (key === 'Enter') this.lastControl.Enter = now;
    // Escape takes NVDA and JAWS out of focus mode (letters would become their own
    // commands again): the focus is put back into the box a moment later, a fresh
    // focus event, so they return to focus mode on their own.
    if (key === 'Escape' && this.holding) setTimeout(() => this.refocus(), 60);
    return false;
  }

  // Leave the box and come straight back: a new focus event for the screen reader.
  refocus() {
    if (!this.holding || !this.field) return;
    try { this.field.blur(); } catch (e) { /* fine */ }
    setTimeout(() => this.focus(), 20);
  }

  // Text about to be typed into the box: nothing ever is, but a Braille driver's
  // word that came with no key presses is read from here.
  _beforeInput(e) {
    e.preventDefault();
    if (!this.enabled) return;
    const now = performance.now();
    this._expire(now);
    const type = e.inputType || '';
    if (type === 'insertLineBreak' || type === 'insertParagraph') {
      if (this.keyTest) { this.speak('Enter, typed.'); return; }
      if (now - (this.lastControl.Enter || -1e9) < CONTROL_DEDUPE) return;
      this.lastControl.Enter = now;
      if (this.buffer) this._flush();
      this.emit('enter');
      return;
    }
    if (type !== 'insertText' && type !== 'insertCompositionText' && type !== 'insertFromPaste') return;
    const data = e.data || '';
    for (const ch of data) {
      const low = ch.toLowerCase();
      if (this._consume(this.recentKeys, low) || this._consume(this.recentText, low)) continue;   // the same press, already handled
      // Text with no key press behind it: a Braille driver's.
      if (!this.detected) {
        this.detected = true;
        if (this.mode === 'auto' && !this.keyTest) this.announcement = 'Braille device detected. Braille keyboard mode is on.';
      }
      if (!this.active && !this.keyTest) continue;
      this._feed(ch, now);
    }
  }

  _noteText(ch, now) { this.recentText.push([ch.toLowerCase(), now]); }

  _expire(now) {
    for (const list of [this.recentKeys, this.recentText]) {
      while (list.length && now - list[0][1] > DEDUPE_WINDOW) list.shift();
    }
  }

  _consume(list, ch) {
    const i = list.findIndex(([c]) => c === ch);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
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
    this.keyTest = false;
    this.buffer = '';
    const end = this.onKeyTestEnd;
    this.onKeyTestEnd = null;
    if (end) end();
  }

  _describeKey(e) {
    const key = e.key || '';
    if (CONTROL_NAMES[key]) return `Key ${CONTROL_NAMES[key]}${e.code ? '' : ', typed'}.`;
    if (key.length === 1) return `Key ${key}${e.code ? '' : ', typed'}.`;
    if (key === 'Unidentified' || key === 'Process' || !key) return `Unknown key, code ${e.keyCode || 0}.`;
    return `Key ${key}.`;
  }
}
