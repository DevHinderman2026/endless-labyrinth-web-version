// The game's own voice, through the browser's speech (the phone's own voices).
//
// Like the desktop game's TTSManager: a line can interrupt whatever is being
// said, a line can be queued after it, and a help topic can play its demo sound
// once the topic has been read to the end. Long lines are spoken sentence by
// sentence, so an interrupt stops the voice at once. Everything said is also put
// on the screen.
//
// Web 6.0.0: during a run, a line goes to Bella (js/bella.js, Kokoro's af_bella, heard
// in the room's echo) when Bella is ready and has every word of it in the game's own
// dictionary; any other line, and every line outside a run (menus, help, settings,
// the Events menu, event descriptions, Game Over and the final score), is said by the
// device's voice, as before. `inRun()` says whether a run is being played (set by the
// game: playing and not paused); speak(text, { device: true }) keeps a line on the
// device's voice whatever the moment. When the Speech setting has silenced the voice
// (Braille only), Bella is silent too. Bella keeps one speed of her own: the Speech
// Rate setting is the device voice's only.

export const RATES = [0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 1.7, 2.0];
export const DEFAULT_RATE = 3;   // 1-based: 1.0, the voice's own speed

export class Speech {
  constructor({ show = () => {}, rateLevel = DEFAULT_RATE, words = null, muted = () => false, bella = null, inRun = () => false } = {}) {
    this.words = words;   // on a computer: gestures turned into keys (keywords.js)
    this.muted = muted;   // Windows, Braille only: the voice is silent, the text still shows (js/braille.js)
    this.bella = bella;   // web 6.0.0: the voice of a run (js/bella.js), or null
    this.inRun = inRun;   // web 6.0.0: whether a run is being played now
    this.bellaLines = 0;  // lines Bella said (for the tests)
    this.deviceLines = 0; // lines the device voice said
    this.synth = window.speechSynthesis || null;
    this.show = show;
    this.gen = 0;
    this.rateLevel = rateLevel;
    this.voice = null;
    this.current = '';
    this.completed = '';
    this.queue = [];
    this.speaking = false;
    if (this.synth) {
      const pick = () => {
        const voices = this.synth.getVoices() || [];
        const lang = (navigator.language || 'en-US').toLowerCase();
        this.voice = voices.find((v) => v.default && v.lang.toLowerCase().startsWith('en'))
          || voices.find((v) => v.lang.toLowerCase() === lang)
          || voices.find((v) => v.lang.toLowerCase().startsWith('en')) || null;
      };
      pick();
      if ('onvoiceschanged' in this.synth) this.synth.onvoiceschanged = pick;
    }
  }

  get rate() { return RATES[Math.max(0, Math.min(RATES.length - 1, this.rateLevel - 1))]; }

  static sentences(text) {
    const parts = String(text).trim().split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => /\w/.test(p));
    return parts.length ? parts : [String(text)];
  }

  // interrupt: stop what is being said and say this instead.
  // after: a function to run once this line has been said to its end.
  // now: start speaking within this very call. Phones allow speech to begin only
  // straight from a touch, so the first line, said as Start is pressed, uses it.
  speak(text, { interrupt = true, after = null, now = false, device = false } = {}) {
    if (text && this.words) text = this.words(text);
    if (text) this.show(text);
    if (interrupt) {
      this.gen += 1;
      this.queue = [];
      if (this.synth) this.synth.cancel();
      if (this.bella) this.bella.stop();
      this.speaking = false;
    }
    if (!text || !String(text).trim()) return;
    this.queue.push({ text: String(text), after, gen: this.gen, device });
    if (!this.speaking) this._next(now);
  }

  stop() {
    this.gen += 1;
    this.queue = [];
    if (this.synth) this.synth.cancel();
    if (this.bella) this.bella.stop();
    this.speaking = false;
  }

  // Whether this line is Bella's to say (web 6.0.0).
  _forBella(item) {
    if (item.device || !this.bella) return false;
    let run = false;
    try { run = !!this.inRun(); } catch (e) { run = false; }
    return run && this.bella.canSay(item.text);
  }

  _next(now = false) {
    const item = this.queue.shift();
    if (!item) { this.speaking = false; return; }
    if (item.gen !== this.gen) { this._next(); return; }
    this.speaking = true;
    this.current = item.text;
    const done = () => {
      if (item.gen !== this.gen) return;
      this.completed = item.text;
      this.current = '';
      if (item.after) { try { item.after(); } catch (e) { /* a demo that could not play */ } }
      this._next();
    };
    // The voice silenced for Braille: the line is on the screen and the display;
    // what follows it (a help demo) comes after a reading pause. Bella is silent too.
    if (this.muted()) { setTimeout(done, Math.min(2500, 300 + item.text.length * 20)); return; }
    // During a run: Bella, if she can say the whole line. What she cannot say in
    // time (the line, or the rest of it) goes to the device voice.
    if (this._forBella(item)) {
      this.bellaLines += 1;
      this.bella.say(item.text, { isCurrent: () => item.gen === this.gen }).then((r) => {
        if (item.gen !== this.gen) return;
        if (r && r.fallback) this._device(r.fallback, item, done, false);
        else done();
      }, () => { if (item.gen === this.gen) this._device(item.text, item, done, false); });
      return;
    }
    this._device(item.text, item, done, now);
  }

  // A line (or the rest of one) said by the device's own voice.
  _device(text, item, done, now = false) {
    this.deviceLines += 1;
    // No voice: the line is on the screen and the display; what follows it (a help
    // demo) comes after a moment.
    if (!this.synth) { setTimeout(done, 50); return; }
    const parts = Speech.sentences(text);
    let i = 0;
    const sayPart = () => {
      if (item.gen !== this.gen) return;
      if (i >= parts.length) { done(); return; }
      const u = new SpeechSynthesisUtterance(parts[i]);
      i += 1;
      u.rate = this.rate;
      if (this.voice) u.voice = this.voice;
      let moved = false;
      const go = () => { if (moved) return; moved = true; clearTimeout(guard); sayPart(); };
      u.onend = go;
      u.onerror = go;
      // Some phones never report the end of an utterance; never wait forever.
      const guard = setTimeout(go, 1500 + parts[i - 1].length * 140 / this.rate);
      this.synth.speak(u);
    };
    // Safari can drop a line spoken in the same moment as a cancel; a breath first.
    if (now) sayPart(); else setTimeout(sayPart, 30);
  }
}
