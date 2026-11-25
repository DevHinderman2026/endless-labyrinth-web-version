"""The Edge's recordings (web 8.0.0): cut, levelled and packed.

Run in Claude's workspace (Russell does not run it):

    python3 tools/edge/make_sounds.py <folder of the original Pixabay downloads> <web repository folder>

Each original is the MP3 exactly as downloaded from Pixabay (kept on Russell's
computer in Downloads\\edge-pixabay). Each finished sound is cut, set to a loudness
like the museum pack's one-shots, limited under -1 dB, and written as Ogg Vorbis,
two channels, 44,100 a second, like every other pack. The sounds placed at a spot
(the glass, the kicked stone) are mono, both channels the same, so they can be
centred. Then packs/edge-<fingerprint>.elpack is written in the packs' own format
(js/packs.js) and packs/manifest.json names it (any older edge pack removed).
"""
import hashlib, json, os, struct, subprocess, sys
import numpy as np

RATE = 44100
MAGIC = b'ELPACK1\n'

# name: (original, start s, end s, loop, rms dB, mono)
SOUNDS = {
    # Glass shattering on stone, a step ahead: "Broken Glass Impact" by Universfield (Pixabay 454859).
    'ed_glass_stone':  ('edge_glass_454859.mp3', 0.0, 1.4, False, -17.0, True),
    # Glass flying out over the edge: "Simple Whoosh" by DRAGON-STUDIO (382724).
    'ed_glass_whoosh': ('edge_whoosh_382724.mp3', 0.0, 0.57, False, -17.0, True),
    # The glass breaking far below: "glass break 3" by freesound_community (102271);
    # the game plays it faint (edge.js ED_DROP_LEVEL).
    'ed_glass_below':  ('edge_below_102271.mp3', 0.0, 0.96, False, -18.0, True),
    # A loose stone kicked off the edge, tumbling away: "Rocks Falling" by
    # freesound_community (44890), its first 1.6 seconds.
    'ed_kick':         ('edge_kick_44890.mp3', 0.0, 1.6, False, -18.0, True),
    # The rush of air as you fall: "Simple Whoosh 02" by DRAGON-STUDIO (433006).
    'ed_fall':         ('edge_fall_433006.mp3', 0.35, 2.85, False, -19.0, False),
    # A man's scream as you fall (Russell's wish): "Male Falling Scream" by Universfield (326183).
    'ed_scream':       ('edge_scream_326183.mp3', 0.0, 3.08, False, -16.0, False),
}
XFADE = 1.0
FADE_OUT = {'edge_glass_454859.mp3': 0.3, 'edge_kick_44890.mp3': 0.5, 'edge_fall_433006.mp3': 0.6, 'edge_scream_326183.mp3': 0.3}
MIXES = []


REPO = None


def from_pack(ref):
    # 'pack:<pack>:<entry>': the entry's Ogg data, from the repository's own pack file.
    _, pack, name = ref.split(':')
    man = json.load(open(os.path.join(REPO, 'packs', 'manifest.json')))
    buf = open(os.path.join(REPO, 'packs', man['packs'][pack]['file']), 'rb').read()
    n = struct.unpack('<I', buf[8:12])[0]
    head = json.loads(buf[12:12 + n]); base = 12 + n
    e = next(e for e in head['entries'] if e['name'] == name and e['kind'] == 'dry')
    return buf[base + e['offset']:base + e['offset'] + e['length']]


def decode(path):
    if path.startswith('pack:'):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-ac', '2', '-ar', str(RATE), '-f', 'f32le', '-'],
                             input=from_pack(path), capture_output=True, check=True).stdout
        return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def make(src, a, b, loop, rms_db, mono):
    x = decode(src)
    if loop:
        n = int((b - a) * RATE); f = int(XFADE * RATE); s = int(a * RATE)
        seg = x[s:s + n + f].copy()
        if len(seg) < n + f:
            raise SystemExit('too short for its loop: ' + src)
        ramp = np.linspace(0, 1, f)[:, None]
        body = seg[:n].copy()
        body[:f] = seg[:f] * ramp + seg[n:n + f] * (1 - ramp)
        y = body
    else:
        y = x[int(a * RATE):int(b * RATE)].copy()
        edge = int(FADE_OUT.get(src if src.startswith('pack:') else os.path.basename(src), 0.01) * RATE)
        y[-edge:] *= np.linspace(1, 0, edge)[:, None]
        if a > 0:                         # cut from the middle: a short fade in, so it does not click
            fin = int(0.01 * RATE)
            y[:fin] *= np.linspace(0, 1, fin)[:, None]
    if mono:
        m = y.mean(axis=1)
        y = np.stack([m, m], axis=1)
    now = np.sqrt(np.mean(y * y))
    g = 10 ** (rms_db / 20) / now
    y = y * g
    lim = 10 ** (-1.0 / 20)
    peak = np.abs(y).max()
    if peak > lim:                       # a soft limit: only the peaks are pressed down
        y = np.tanh(y / lim) * lim
    return y.astype(np.float32)


def to_ogg(y, out):
    tmp = out + '.raw'
    y.astype('<f4').tofile(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i', tmp, '-c:a', 'libvorbis',
                    '-q:a', '4', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'ogg', out], check=True)
    os.remove(tmp)


def main():
    src_dir, repo = sys.argv[1:3]
    work = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'finished')
    os.makedirs(work, exist_ok=True)
    entries = []; blobs = []; off = 0
    global REPO
    REPO = repo
    made = {name: make(f if f.startswith('pack:') else os.path.join(src_dir, f), a, b, loop, rms, mono) for name, (f, a, b, loop, rms, mono) in SOUNDS.items()}
    parts = set()
    for name, ps, rms in MIXES:
        n = min(len(made[q]) for q in ps)
        y = sum(made[q][:n].astype(np.float64) for q in ps)
        y *= 10 ** (rms / 20) / np.sqrt(np.mean(y * y))
        lim = 10 ** (-1.0 / 20)
        if np.abs(y).max() > lim: y = np.tanh(y / lim) * lim
        made[name] = y.astype(np.float32)
        parts.update(q for q in ps if q != name)
    for name, (f, a, b, loop, rms, mono) in SOUNDS.items():
        if name in parts:
            continue
        y = made[name]
        ogg = os.path.join(work, name + '.ogg')
        to_ogg(y, ogg)
        data = open(ogg, 'rb').read()
        entries.append({'kind': 'dry', 'name': name, 'frames': len(y), 'loop': loop, 'offset': off, 'length': len(data)})
        blobs.append(data); off += len(data)
        w = int(0.05 * RATE); e = (y.astype(np.float64) ** 2).mean(axis=1)
        peak = max(range(0, max(1, len(e) - w), w // 2), key=lambda i: e[i:i + w].mean()) / RATE
        print(f'{name}: {len(y) / RATE:.2f} s, {len(data)} bytes, loudest at {peak:.2f} s')
    header = json.dumps({'pack': 'edge', 'rate': RATE, 'entries': entries}, separators=(',', ':')).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'edge-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    packs = os.path.join(repo, 'packs')
    for old in os.listdir(packs):
        if old.startswith('edge-') and old.endswith('.elpack') and old != fname:
            os.remove(os.path.join(packs, old))
    open(os.path.join(packs, fname), 'wb').write(body)
    mpath = os.path.join(packs, 'manifest.json')
    m = json.load(open(mpath))
    m['packs']['edge'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh:
        json.dump(m, fh, indent=1)
    print(fname, len(body))


if __name__ == '__main__':
    main()
