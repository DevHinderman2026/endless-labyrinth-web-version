"""Volcanic Caves' recordings (web 8.2.0): cut, levelled and packed.

Run in Claude's workspace (Russell does not run it):

    python3 tools/volcanic/make_sounds.py <folder of the original downloads> <web repository folder>

The originals are the MP3s exactly as downloaded from Pixabay on 27 November 2026 (kept on
Russell's computer in Downloads\\caves-toys-pixabay), plus Escape the Cave's own game file of
"Cauldron Boiling" (evt_cauldron.ogg, copied as evt_cauldron_etc.ogg), the lava of that game.
Each finished sound is cut, set to a loudness, limited under -1 dB and written as Ogg Vorbis,
two channels, 44,100 a second, like every other pack. The sounds placed at a spot (the bombs'
ticking, the hole's pop) are mono, both channels the same, so they can be centred. Then
packs/volcanic-<fingerprint>.elpack is written in the packs' own format (js/packs.js) and
packs/manifest.json names it (any older volcanic pack removed). The originals are never changed.
"""
import hashlib, json, os, struct, subprocess, sys
import numpy as np

RATE = 44100
MAGIC = b'ELPACK1\n'

# name: (original, start s, end s, loop, rms dB, mono)
SOUNDS = {
    # The cave's air: "Volcanic Underground Bubbling Ambience" by Alex_Jauk (Pixabay 345241),
    # looped over its first 24 seconds with a one-second crossfade. (Escape the Cave's cave
    # air sounds like wind, so it is not used.)
    'vc_air':   ('vc_amb_345241.mp3', 0.0, 24.0, True, -26.0, False),
    # The lava, Escape the Cave's (Russell, 27 November 2026): "Cauldron Boiling" by Irhouen
    # (Pixabay 173607), from that game's evt_cauldron.ogg, its two sides evened out as that
    # game does (balance(), below: the right side is about 4 dB louder), looped. The game
    # raises it level after level as Escape the Cave does (volcanic.js lavaLevel).
    'vc_lava':  ('evt_cauldron_etc.ogg', 0.0, 19.4, True, -20.0, False),
    # A bomb's tick: "ticking bomb" by freesound_community (Pixabay 90319), its first tick
    # alone; the game plays it every half second (VC_TICK_EVERY).
    'vc_tick':  ('vc_tick_90319.mp3', 0.02, 0.12, False, -20.0, True),
    # The explosion: "Loud Explosion" by DRAGON-STUDIO (Pixabay 425457).
    'vc_boom':  ('vc_boom_425457.mp3', 0.0, 2.85, False, -12.0, False),
    # The rock wall: "Heavy Boulder Thud" by DRAGON-STUDIO (Pixabay 515257), its thud.
    'vc_rock':  ('vc_rock_515257.mp3', 0.32, 1.15, False, -16.0, True),
    # Into the hole: a pop, "Billiard Hole" by Alex_Jauk (Pixabay 288419), the ball dropping
    # into the pocket; and the landing on the level below, "Heavy Object Falling" by
    # Universfield (Pixabay 291096).
    'vc_pop':   ('vc_drop_288419.mp3', 0.05, 0.83, False, -18.0, True),
    'vc_land':  ('vc_drop_291096.mp3', 0.08, 1.6, False, -17.0, False),
}
BALANCE = {'vc_lava'}


def balance(y):
    """Both sides as loud as each other (Escape the Cave, cave_audio.py: the recording's right
    side is about 4 dB louder, which pulled the cave to the right)."""
    sides = np.sqrt(np.mean(y ** 2, axis=0))
    if np.all(sides > 1e-6):
        y = y * (float(np.mean(sides)) / sides)[None, :]
    return y

XFADE = 1.0
FADE_OUT = {'vc_rock_515257.mp3': 0.25, 'vc_boom_425457.mp3': 0.6, 'vc_drop_291096.mp3': 0.3, 'vc_drop_288419.mp3': 0.15}
FADE_NAMED = {'vc_tick': 0.01}
FADE_IN_NAMED = {}
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


def make(src, a, b, loop, rms_db, mono, name=None):
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
        edge = int(FADE_NAMED.get(name, FADE_OUT.get(src if src.startswith('pack:') else os.path.basename(src), 0.01)) * RATE)
        y[-edge:] *= np.linspace(1, 0, edge)[:, None]
        if a > 0 or name in FADE_IN_NAMED:   # cut from the middle: a short fade in, so it does not click
            fin = int(FADE_IN_NAMED.get(name, 0.01) * RATE)
            y[:fin] *= np.linspace(0, 1, fin)[:, None]
    if name in BALANCE:
        y = balance(y)
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
    made = {name: make(f if f.startswith('pack:') else os.path.join(src_dir, f), a, b, loop, rms, mono, name) for name, (f, a, b, loop, rms, mono) in SOUNDS.items()}
    parts = set()
    for name, ps, rms in MIXES:
        ps = [(q, 0.0) if isinstance(q, str) else q for q in ps]
        n = max(int(at * RATE) + len(made[q]) for q, at in ps)
        y = np.zeros((n, 2))
        for q, at in ps:
            k = int(at * RATE); y[k:k + len(made[q])] += made[q].astype(np.float64)
        ps = [q for q, _ in ps]
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
    header = json.dumps({'pack': 'volcanic', 'rate': RATE, 'entries': entries}, separators=(',', ':')).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'volcanic-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    packs = os.path.join(repo, 'packs')
    for old in os.listdir(packs):
        if old.startswith('volcanic-') and old.endswith('.elpack') and old != fname:
            os.remove(os.path.join(packs, old))
    open(os.path.join(packs, fname), 'wb').write(body)
    mpath = os.path.join(packs, 'manifest.json')
    m = json.load(open(mpath))
    m['packs']['volcanic'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh:
        json.dump(m, fh, indent=1)
    print(fname, len(body))


if __name__ == '__main__':
    main()
