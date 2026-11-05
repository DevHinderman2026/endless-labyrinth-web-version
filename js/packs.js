// The sound packs: downloaded once, then kept on the phone.
//
// packs/manifest.json names the current pack files. Each file's name carries a
// fingerprint of its contents, so a pack that has not changed keeps its name and
// is never downloaded again; a pack that has changed (new sounds for a new mode,
// say) gets a new name and only that one is fetched. Packs are kept in the
// browser's Cache Storage, and old ones are removed.

const CACHE = 'endless-labyrinth-sounds';
const MAGIC = 'ELPACK1\n';

async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not download ' + url + ' (' + res.status + ')');
  if (!res.body || !res.body.getReader) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}

// A pack is kept as a Blob, not in memory: the one Cache Storage hands back is
// stored on the phone, so a sound is read from it only when it is decoded. (Holding
// every pack in memory as well as the decoded sounds was too much for a phone in a
// chaos run.) Each entry's bytes are read with pack.read(entry).
async function parsePack(blob) {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const magic = new TextDecoder().decode(head.subarray(0, 8));
  if (magic !== MAGIC) throw new Error('A sound pack is damaged.');
  const len = new DataView(head.buffer, 8, 4).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(await blob.slice(12, 12 + len).arrayBuffer()));
  const base = 12 + len;
  return {
    name: header.pack,
    entries: header.entries,
    read: (e) => blob.slice(base + e.offset, base + e.offset + e.length).arrayBuffer(),
  };
}

// ------------------------------------------------------------ one sound at a time
// For the website's Help page (web 1.3.0): every pack's index, without downloading
// the packs, so a demo can play one sound. A pack the game has already kept on this
// device is read from there, and nothing is downloaded. Any other pack is read from
// the site a piece at a time (an HTTP range request: the 12-byte start, the index,
// then just the sound asked for). If the server ignores ranges, the index is still
// read from the start of the file and the download stopped there; the pack that
// holds a sound asked for is then downloaded whole, once, and kept exactly as the
// game keeps it.

// Bytes start..end of a file: { buf, ranged } (ranged false: the server sent the
// whole file, and only as much as needed was read).
async function fetchRange(url, start, end) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok) throw new Error('Could not download ' + url + ' (' + res.status + ')');
  if (res.status === 206) return { buf: await res.arrayBuffer(), ranged: true };
  const want = end + 1;
  if (!res.body || !res.body.getReader) return { buf: (await res.arrayBuffer()).slice(start, want), ranged: false };
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  while (got < want) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  try { await reader.cancel(); } catch (e) { /* finished anyway */ }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return { buf: out.buffer.slice(start, want), ranged: false };
}

async function keepWhole(cache, url) {
  const buf = await fetchWithProgress(url, () => {});
  let blob = null;
  if (cache) {
    try {
      await cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } }));
      const back = await cache.match(url);
      if (back) blob = await back.blob();
    } catch (e) { /* no room: held in memory for this page */ }
  }
  return parsePack(blob || new Blob([buf]));
}

async function remotePack(url, cache) {
  const first = await fetchRange(url, 0, 11);
  const head = new Uint8Array(first.buf);
  if (new TextDecoder().decode(head.subarray(0, 8)) !== MAGIC) throw new Error('A sound pack is damaged.');
  const len = new DataView(head.buffer, 8, 4).getUint32(0, true);
  const index = await fetchRange(url, 12, 12 + len - 1);
  const header = JSON.parse(new TextDecoder().decode(index.buf));
  const base = 12 + len;
  const pack = { name: header.pack, entries: header.entries, remote: true, ranged: first.ranged && index.ranged, bytesRead: 12 + len };
  let whole = null;   // the whole pack, once it has had to be downloaded
  pack.read = async (e) => {
    if (whole) return (await whole).read(e);
    if (pack.ranged) {
      const r = await fetchRange(url, base + e.offset, base + e.offset + e.length - 1);
      if (r.ranged) { pack.bytesRead += r.buf.byteLength; return r.buf; }
      pack.ranged = false;
    }
    whole = whole || keepWhole(cache, url);
    return (await whole).read(e);
  };
  return pack;
}

export async function openPacks() {
  const res = await fetch('packs/manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not find the sound packs.');
  const manifest = await res.json();
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { cache = null; }
  const out = [];
  for (const p of Object.values(manifest.packs)) {
    const url = 'packs/' + p.file;
    let blob = null;
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) { blob = await hit.blob(); if (blob.size !== p.bytes) blob = null; }
      } catch (e) { blob = null; }
    }
    out.push(blob ? await parsePack(blob) : await remotePack(url, cache));
  }
  return out;
}

export async function loadPacks(onProgress = () => {}) {
  const res = await fetch('packs/manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not find the sound packs.');
  const manifest = await res.json();
  const list = Object.values(manifest.packs);
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { cache = null; }
  const total = list.reduce((s, p) => s + p.bytes, 0);
  let done = 0;
  const packs = [];
  for (const p of list) {
    const url = 'packs/' + p.file;
    let blob = null;
    if (cache) {
      const hit = await cache.match(url);
      if (hit) {
        blob = await hit.blob();
        if (blob.size !== p.bytes) blob = null;
      }
    }
    if (blob) {
      done += p.bytes;
      onProgress(done / total, true);
    } else {
      let buf = await fetchWithProgress(url, (n) => { done += n; onProgress(done / total, false); });
      blob = null;
      if (cache) {
        try {
          await cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } }));
          const back = await cache.match(url);
          if (back) blob = await back.blob();
        } catch (e) { /* no room: it is simply downloaded again next time */ }
      }
      // Without Cache Storage the pack is held in memory, as before.
      if (!blob || blob.size !== p.bytes) blob = new Blob([buf]);
      buf = null;
    }
    packs.push(await parsePack(blob));
  }
  // Remove packs the game no longer uses.
  if (cache) {
    try {
      const keep = new Set(list.map((p) => 'packs/' + p.file));
      for (const req of await cache.keys()) {
        const path = new URL(req.url).pathname;
        const name = 'packs/' + path.split('/').pop();
        if (!keep.has(name)) await cache.delete(req);
      }
    } catch (e) { /* not important */ }
  }
  return packs;
}
