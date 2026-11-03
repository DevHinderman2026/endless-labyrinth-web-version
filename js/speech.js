// The game's own voice, through the browser's speech (the phone's own voices).
//
// Like the desktop game's TTSManager: a line can interrupt whatever is being
// said, a line can be queued after it, and a help topic can play its demo sound
// once the topic has been read to the end. Long lines are spoken sentence by
// sentence, so an interrupt stops the voice at once. Everything said is also put
// on the screen.

export const RATES = [0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 1.7, 2.0];
export const DEFAULT_RATE = 3;   // 1-based: 1.0, the voice's own speed

export class Speech {
  constructor({ show = () => {}, rateLevel = DEFAULT_RATE, words = null } = {}) {
    this.words = words;   // on a computer: gestures turned into keys (keywords.js)
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
  speak(text, { interrupt = true, after = null, now = false } = {}) {
    if (text && this.words) text = this.words(text);
    if (text) this.show(text);
    if (interrupt) {
      this.gen += 1;
      this.queue = [];
      if (this.synth) this.synth.cancel();
      this.speaking = false;
    }
    if (!text || !String(text).trim()) return;
    this.queue.push({ text: String(text), after, gen: this.gen });
    if (!this.speaking) this._next(now);
  }

  stop() {
    this.gen += 1;
    this.queue = [];
    if (this.synth) this.synth.cancel();
    this.speaking = false;
  }

  _next(now = false) {
    const item = this.queue.shift();
    if (!item) { this.speaking = false; return; }
    if (item.gen !== this.gen) { this._next(); return; }
    this.speaking = true;
    this.current = item.text;
    const parts = Speech.sentences(item.text);
    const done = () => {
      if (item.gen !== this.gen) return;
      this.completed = item.text;
      this.current = '';
      if (item.after) { try { item.after(); } catch (e) { /* a demo that could not play */ } }
      this._next();
    };
    if (!this.synth) { setTimeout(done, 50); return; }
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
