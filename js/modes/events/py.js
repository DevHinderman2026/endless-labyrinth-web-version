// Python's random module and a few built-ins, as the desktop event code uses them.

export const random = () => Math.random();
export const uniform = (a, b) => a + (b - a) * Math.random();
export const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const randrange = (n) => Math.floor(Math.random() * n);
export function choice(seq) {
  if (!seq.length) throw new RangeError('Cannot choose from an empty sequence');
  return seq[Math.floor(Math.random() * seq.length)];
}
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function sample(seq, k) {
  if (k > seq.length) throw new RangeError('Sample larger than population');
  return shuffle([...seq]).slice(0, k);
}
// random.choices(values, weights=weights)[0]
export function choices(values, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++) { r -= weights[i]; if (r < 0) return values[i]; }
  return values[values.length - 1];
}
export const hypot = Math.hypot;
export const int = Math.trunc;
export const plural = (n, one, many) => (n === 1 ? one : many);
// Python's range(start, stop, step), as a list.
export function range(start, stop, step = 1) {
  const out = [];
  for (let v = start; step > 0 ? v < stop : v > stop; v += step) out.push(v);
  return out;
}
