// The echo of a looping sound, worked out in the background: the desktop game's
// reverb_apply(loop=True). The loop is convolved circularly with the room's impulse
// (its tail wraps round onto the loop's start, so the echo loops with it to the
// sample), and the result is never louder at its peak than 0.9 of full scale.
//
// This used to be rendered with the browser's OfflineAudioContext, but an iPhone's
// browser fails, or closes the page, after a few dozen of those (WebKit bug 224279),
// which a chaos run reached in its third battle. Plain arithmetic here has no limit.
//
// Message in: { id, dry: [Float32Array, ...] (1 or 2 channels), ir: [Float32Array,
// Float32Array] }. Message out: { id, out: [Float32Array, Float32Array] }.

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang); const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k; const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// One channel: the loop x (length n) convolved circularly with the impulse h.
function circular(x, h) {
  const n = x.length;
  // The impulse folded onto the loop's length: every turn of its tail lands on the
  // same loop, as the desktop folds it.
  const hf = new Float64Array(n);
  for (let i = 0; i < h.length; i++) hf[i % n] += h[i];
  let size = 1;
  while (size < 2 * n) size <<= 1;
  const ar = new Float64Array(size); const ai = new Float64Array(size);
  const br = new Float64Array(size); const bi = new Float64Array(size);
  for (let i = 0; i < n; i++) { ar[i] = x[i]; br[i] = hf[i]; }
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < size; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    const m = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r; ai[i] = m;
  }
  fft(ar, ai, true);
  // The linear result folded back onto one turn of the loop.
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = ar[i] + ar[i + n];
  return y;
}

self.onmessage = (ev) => {
  const { id, dry, ir } = ev.data;
  try {
    const out = [0, 1].map((c) => circular(dry[Math.min(c, dry.length - 1)], ir[Math.min(c, ir.length - 1)]));
    let peak = 0;
    for (const ch of out) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
    const limit = 0.9 * 32767 / 32768;
    if (peak > limit) { const k = limit / peak; for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= k; }
    self.postMessage({ id, out }, out.map((c) => c.buffer));
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
