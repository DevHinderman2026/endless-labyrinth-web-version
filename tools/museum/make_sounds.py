"""The Museum's recordings (web 7.2.0): cut, levelled and packed.

Run in Claude's workspace (Russell does not run it):

    python3 tools/museum/make_sounds.py <folder of the original Pixabay downloads> <web repository folder>

Each original is the MP3 exactly as downloaded from Pixabay (kept on Russell's
computer in Downloads\\museum-pixabay). Each finished sound is cut, made a
seamless loop where it loops (its end cross-faded into its start), set to a
loudness by ear-tested references (the abyss and water park packs: loops about
-20 dB RMS, one-shots -15 to -20), limited under -1 dB, and written as Ogg
Vorbis, two channels, 44,100 a second, like every other pack. The placed loops
(the pools, a spark) are mono, both channels the same, so they can be centred.
Then packs/museum-<fingerprint>.elpack is written in the packs' own format
(js/packs.js) and packs/manifest.json names it (any older museum pack removed).
"""
import hashlib, json, os, struct, subprocess, sys
import numpy as np

RATE = 44100
MAGIC = b'ELPACK1\n'

# name: (original, start s, end s, loop, rms dB, mono)
SOUNDS = {
    # The bottomless pools: "Rapid Bubbling" by DRAGON-STUDIO (Pixabay 584722).
    'mu_pool':       ('museum_pool_584722.mp3', 10.0, 30.0, True, -21.0, True),
    # A fiery memory's firework: "Firework Explosion With Echo" by Alex_Jauk (147321): the launch, then the burst.
    'mu_firework':   ('museum_fw_147321.mp3', 0.0, 6.0, False, -17.0, False),
    # A spark popping as you step on it: "Firecracker" by freesound_community (106974).
    # (7.2.2 tried a loop of "Firecrackers" by Alex_Jauk over "Sparkler" by Dawnton, and a
    # fizzle; from 7.2.3 the sparks are silent until you step, and each step pops one.)
    'mu_stamp':      ('museum_spark_106974.mp3', 0.0, 1.1, False, -18.0, False),
    # The exit's buzzer, Russell's choice: "Loud Buzzer" by freesound_community (100567).
    # (Its first 2 seconds since 7.2.4; Russell found the whole 3.3 too long.)
    'mu_buzzer':     ('museum_buzz_100567.mp3', 0.0, 2.0, False, -17.0, False),
    # The door: "Heavy Door Open and Closing" by HookedMedia (585113), cut in two.
    'mu_door_open':  ('museum_door_585113.mp3', 0.0, 2.3, False, -24.0, False),
    'mu_door_close': ('museum_door_585113.mp3', 2.3, 4.17, False, -18.0, False),
    # A creature's roar as it wakes or first hears you, in The Museum and The Abyss (7.2.5):
    # "Dinosaur Growl" by DRAGON-STUDIO (Pixabay 487679), taken from the events2 pack, where
    # it already is, its first 2.2 seconds.
    'creature_roar': ('pack:events2:evt_dinosaur_growl', 0.0, 2.2, False, -15.0, False),
}
XFADE = 1.0     # seconds of a loop's end cross-faded into its start
# A one-shot cut in the middle of a steady sound fades out over this long, not 0.01 s.
FADE_OUT = {'museum_buzz_100567.mp3': 0.08, 'pack:events2:evt_dinosaur_growl': 0.4}
# Sounds made of two: (name, [parts], rms dB). The parts are not packed on their own.
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
        print(f'{name}: {len(y) / RATE:.2f} s, {len(data)} bytes')
    header = json.dumps({'pack': 'museum', 'rate': RATE, 'entries': entries}, separators=(',', ':')).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'museum-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    packs = os.path.join(repo, 'packs')
    for old in os.listdir(packs):
        if old.startswith('museum-') and not old.startswith('museum-voice-') and old.endswith('.elpack') and old != fname:
            os.remove(os.path.join(packs, old))
    open(os.path.join(packs, fname), 'wb').write(body)
    mpath = os.path.join(packs, 'manifest.json')
    m = json.load(open(mpath))
    m['packs']['museum'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh:
        json.dump(m, fh, indent=1)
    print(fname, len(body))


if __name__ == '__main__':
    main()
