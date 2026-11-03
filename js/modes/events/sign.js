// Event signatures: how the game knows an event was made by the developer
// (the desktop's event_sign.py).
//
// The developer's Event Maker signs every event file with a secret key that exists
// only on the developer's computer. The game carries the matching public key
// (event_key.pub, below) and plays an event only when its signature checks out.
//
// What is signed: the event file's own settings, every one except "signature",
// written in one fixed way: Python's json.dumps(body, sort_keys=True,
// separators=(',', ':'), ensure_ascii=False), as UTF-8. That text is rebuilt here
// byte for byte from the file itself, so whole numbers stay whole (2) and decimals
// stay decimals (2.0), exactly as Python reads and writes them.
//
// The check is Ed25519 (RFC 8032): the browser's own (WebCrypto) where it has it,
// otherwise the desktop's own verify, ported line by line below.

// Dev Builds/event_key.pub
export const EVENT_KEY_HEX = '2fb86e6bd546ec0cc320041a1aaa3e4510a018f206241c54b6178aeb11001a98';

// ------------------------------------------------------------ JSON, read and written as Python does
// A number keeps what Python would make of it: an int (its digits) or a float.
class PyInt { constructor(text) { this.text = text === '-0' ? '0' : text.replace(/^(-?)0+(?=\d)/, '$1'); } }
class PyFloat { constructor(value) { this.value = value; } }

// Parse JSON text the way Python's json.loads does, into a tree whose numbers are
// PyInt or PyFloat, objects are Maps (in file order) and the rest plain values.
export function pyParse(text) {
  let i = 0;
  const s = text;
  const ws = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++; };
  const fail = (what) => { throw new SyntaxError(`${what} at character ${i}`); };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++;
      const m = new Map();
      ws();
      if (s[i] === '}') { i++; return m; }
      for (;;) {
        ws();
        if (s[i] !== '"') fail('Expecting property name enclosed in double quotes');
        const k = str();
        ws();
        if (s[i] !== ':') fail("Expecting ':' delimiter");
        i++;
        m.set(k, value());
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return m; }
        fail("Expecting ',' delimiter");
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      ws();
      if (s[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value());
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        fail("Expecting ',' delimiter");
      }
    }
    if (c === '"') return str();
    if (s.startsWith('true', i)) { i += 4; return true; }
    if (s.startsWith('false', i)) { i += 5; return false; }
    if (s.startsWith('null', i)) { i += 4; return null; }
    if (s.startsWith('NaN', i)) { i += 3; return new PyFloat(NaN); }
    if (s.startsWith('Infinity', i)) { i += 8; return new PyFloat(Infinity); }
    if (s.startsWith('-Infinity', i)) { i += 9; return new PyFloat(-Infinity); }
    const m = /^(-?(?:0|[1-9]\d*))(\.\d+)?([eE][-+]?\d+)?/.exec(s.slice(i, i + 400));
    if (!m) fail('Expecting value');
    i += m[0].length;
    if (m[2] || m[3]) return new PyFloat(Number(m[0]));
    return new PyInt(m[1]);
  };
  const str = () => {
    const start = i;
    i++;
    for (;;) {
      if (i >= s.length) fail('Unterminated string');
      const c = s[i];
      if (c === '"') break;
      if (c === '\\') { i += 2; continue; }
      if (c < ' ') fail('Invalid control character');
      i++;
    }
    i++;
    return JSON.parse(s.slice(start, i));
  };
  const v = value();
  ws();
  if (i !== s.length) fail('Extra data');
  return v;
}

// The tree as plain JavaScript values (numbers as numbers), for the game to use.
export function pyPlain(v) {
  if (v instanceof PyInt) return Number(v.text);
  if (v instanceof PyFloat) return v.value;
  if (Array.isArray(v)) return v.map(pyPlain);
  if (v instanceof Map) {
    const o = {};
    for (const [k, x] of v) o[k] = pyPlain(x);
    return o;
  }
  return v;
}

// Python's repr of a float, which json.dumps writes: the shortest digits that read
// back the same, in exponent form below 1e-4 or from 1e16 up.
export function pyFloatRepr(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const sign = x < 0 ? '-' : '';
  const [mant, e] = Math.abs(x).toExponential().split('e');
  const digits = mant.replace('.', '');
  const decpt = Number(e) + 1;
  let out;
  if (decpt <= -4 || decpt > 16) {
    const exp = decpt - 1;
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (exp < 0 ? '-' : '+')
      + String(Math.abs(exp)).padStart(2, '0');
  } else if (decpt <= 0) {
    out = '0.' + '0'.repeat(-decpt) + digits;
  } else if (decpt >= digits.length) {
    out = digits + '0'.repeat(decpt - digits.length) + '.0';
  } else {
    out = digits.slice(0, decpt) + '.' + digits.slice(decpt);
  }
  return sign + out;
}

function codePointCompare(a, b) {
  const A = [...a]; const B = [...b];
  for (let k = 0; k < Math.min(A.length, B.length); k++) {
    const d = A[k].codePointAt(0) - B[k].codePointAt(0);
    if (d) return d;
  }
  return A.length - B.length;
}

// json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
export function pyDumps(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v instanceof PyInt) return v.text;
  if (v instanceof PyFloat) return pyFloatRepr(v.value);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(pyDumps).join(',') + ']';
  if (v instanceof Map) {
    const keys = [...v.keys()].sort(codePointCompare);
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + pyDumps(v.get(k))).join(',') + '}';
  }
  throw new TypeError('not JSON');
}

// The exact bytes an event's signature covers: every setting in the file except the
// signature itself (and the game's own working values, which start with _).
export function eventMessage(tree) {
  const body = new Map([...tree].filter(([k]) => k !== 'signature' && !k.startsWith('_')));
  return new TextEncoder().encode(pyDumps(body));
}

// ------------------------------------------------------------ Ed25519 (RFC 8032), the desktop's verify
const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = (a, m = P) => { const r = a % m; return r < 0n ? r + m : r; };
function powmod(b, e, m = P) {
  let r = 1n; b = mod(b, m);
  while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; }
  return r;
}
const D = mod(-121665n * powmod(121666n, P - 2n));
const SQRT_M1 = powmod(2n, (P - 1n) / 4n);

function recoverX(y, sign) {
  if (y >= P) return null;
  const x2 = mod((y * y - 1n) * powmod(D * y * y + 1n, P - 2n));
  if (x2 === 0n) return sign ? null : 0n;
  let x = powmod(x2, (P + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = x * SQRT_M1 % P;
  if (mod(x * x - x2) !== 0n) return null;
  if (Number(x & 1n) !== sign) x = P - x;
  return x;
}
const GY = 4n * powmod(5n, P - 2n) % P;
const GX = recoverX(GY, 0);
const G = [GX, GY, 1n, GX * GY % P];

function add(a, b) {
  const A = mod((a[1] - a[0]) * (b[1] - b[0]));
  const B = mod((a[1] + a[0]) * (b[1] + b[0]));
  const C = mod(2n * a[3] * b[3] * D);
  const Dd = mod(2n * a[2] * b[2]);
  const E = B - A; const F = Dd - C; const Gg = Dd + C; const H = B + A;
  return [mod(E * F), mod(Gg * H), mod(F * Gg), mod(E * H)];
}
function mul(s, pt) {
  let q = [0n, 1n, 1n, 0n];
  while (s > 0n) {
    if (s & 1n) q = add(q, pt);
    pt = add(pt, pt);
    s >>= 1n;
  }
  return q;
}
const same = (a, b) => mod(a[0] * b[2] - b[0] * a[2]) === 0n && mod(a[1] * b[2] - b[1] * a[2]) === 0n;
const leInt = (bytes) => { let n = 0n; for (let k = bytes.length - 1; k >= 0; k--) n = (n << 8n) | BigInt(bytes[k]); return n; };
function decompress(b) {
  if (b.length !== 32) return null;
  let y = leInt(b);
  const sign = Number(y >> 255n);
  y &= (1n << 255n) - 1n;
  const x = recoverX(y, sign);
  if (x === null) return null;
  return [x, y, 1n, x * y % P];
}

async function sha512(bytes) {
  if (globalThis.crypto && crypto.subtle) return new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
  return sha512Plain(bytes);
}

export async function verifyPlain(pub, message, signature) {
  if (pub.length !== 32 || signature.length !== 64) return false;
  const A = decompress(pub);
  const R = decompress(signature.subarray(0, 32));
  if (A === null || R === null) return false;
  const s = leInt(signature.subarray(32));
  if (s >= L) return false;
  const h = new Uint8Array(32 + 32 + message.length);
  h.set(signature.subarray(0, 32), 0); h.set(pub, 32); h.set(message, 64);
  const k = leInt(await sha512(h)) % L;
  return same(mul(s, G), add(R, mul(k, A)));
}

// SHA-512 for a browser without WebCrypto at all (FIPS 180-4), with BigInt.
function sha512Plain(msg) {
  const K = ['428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538',
    '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118', 'd807aa98a3030242', '12835b0145706fbe',
    '243185be4ee4b28c', '550c7dc3d5ffb4e2', '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235',
    'c19bf174cf692694', 'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65',
    '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5', '983e5152ee66dfab',
    'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725',
    '06ca6351e003826f', '142929670a0e6e70', '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed',
    '53380d139d95b3df', '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b',
    'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218',
    'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8', '19a4c116b8d2d0c8', '1e376c085141ab53',
    '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373',
    '682e6ff3d6b2b8a3', '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec',
    '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b', 'ca273eceea26619c',
    'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6',
    '113f9804bef90dae', '1b710b35131c471b', '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc',
    '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817']
    .map((h) => BigInt('0x' + h));
  const M64 = (1n << 64n) - 1n;
  const rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M64;
  let H = ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1',
    '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179'].map((h) => BigInt('0x' + h));
  const len = msg.length;
  const total = Math.ceil((len + 17) / 128) * 128;
  const buf = new Uint8Array(total);
  buf.set(msg); buf[len] = 0x80;
  let bits = BigInt(len) * 8n;
  for (let k = total - 1; k >= total - 16; k--) { buf[k] = Number(bits & 0xffn); bits >>= 8n; }
  for (let off = 0; off < total; off += 128) {
    const W = [];
    for (let t = 0; t < 16; t++) {
      let w = 0n;
      for (let b = 0; b < 8; b++) w = (w << 8n) | BigInt(buf[off + t * 8 + b]);
      W.push(w);
    }
    for (let t = 16; t < 80; t++) {
      const s0 = rotr(W[t - 15], 1n) ^ rotr(W[t - 15], 8n) ^ (W[t - 15] >> 7n);
      const s1 = rotr(W[t - 2], 19n) ^ rotr(W[t - 2], 61n) ^ (W[t - 2] >> 6n);
      W.push((W[t - 16] + s0 + W[t - 7] + s1) & M64);
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 80; t++) {
      const S1 = rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n);
      const ch = (e & f) ^ (~e & M64 & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) & M64;
      const S0 = rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & M64;
      h = g; g = f; f = e; e = (d + t1) & M64; d = c; c = b; b = a; a = (t1 + t2) & M64;
    }
    H = H.map((x, k) => (x + [a, b, c, d, e, f, g, h][k]) & M64);
  }
  const out = new Uint8Array(64);
  H.forEach((x, k) => { for (let b = 7; b >= 0; b--) { out[k * 8 + b] = Number(x & 0xffn); x >>= 8n; } });
  return out;
}

// ------------------------------------------------------------ checking an event
const fromHex = (h) => {
  if (typeof h !== 'string' || h.length % 2 || /[^0-9a-fA-F]/.test(h)) return null;
  const out = new Uint8Array(h.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = parseInt(h.substr(k * 2, 2), 16);
  return out;
};

let webKey;     // the imported WebCrypto key, null where WebCrypto has no Ed25519
async function webVerify(pub, message, sig) {
  if (webKey === undefined) {
    try {
      webKey = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    } catch (e) { webKey = null; }
  }
  if (!webKey) return undefined;
  try { return await crypto.subtle.verify({ name: 'Ed25519' }, webKey, sig, message); } catch (e) { return undefined; }
}

export const signatureEngine = { forcePlain: false, last: '' };

export async function verify(pub, message, signature) {
  if (!signatureEngine.forcePlain && globalThis.crypto && crypto.subtle) {
    const ok = await webVerify(pub, message, signature);
    if (ok !== undefined) { signatureEngine.last = 'webcrypto'; return ok; }
  }
  signatureEngine.last = 'plain';
  return verifyPlain(pub, message, signature);
}

// [true, ''] if the event file (its parsed tree) is signed with the developer's
// key, else [false, the reason in plain words].
export async function checkSignature(tree, pubHex = EVENT_KEY_HEX) {
  const pub = fromHex(pubHex);
  if (!pub || pub.length !== 32) return [false, 'This copy of the game has no event key (event_key.pub), so it cannot trust any event.'];
  if (!(tree instanceof Map)) return [false, 'The file is not an event.'];
  const sig = tree.get('signature');
  if (!sig) return [false, 'It is not signed. Save it in the Event Maker, or publish, to sign it.'];
  const raw = typeof sig === 'string' ? fromHex(sig) : null;
  if (!raw) return [false, 'Its signature is damaged.'];
  if (!(await verify(pub, eventMessage(tree), raw))) {
    return [false, 'Its signature does not match: it was changed after it was signed, or it was not signed with the developer\'s key.'];
  }
  return [true, ''];
}

export { PyInt, PyFloat, sha512Plain };
