"""Toy Memory's recordings (web 8.2.0): cut, levelled and packed.

Run in Claude's workspace (Russell does not run it):

    python3 tools/toymemory/make_sounds.py <folder of the original Pixabay downloads> <web repository folder>

Each original is the MP3 exactly as downloaded from Pixabay on 27 November 2026 (kept on
Russell's computer in Downloads\\caves-toys-pixabay); they are never changed. Each finished
sound is cut, set to a loudness, limited under -1 dB, and written as Ogg Vorbis, two
channels, 44,100 a second, like every other pack. The music box, placed where the box
stands and found by ear, is mono (both channels the same), as is the box opening. Then
packs/toymemory-<fingerprint>.elpack is written in the packs' own format (js/packs.js) and
packs/manifest.json names it (any older toymemory pack removed).

The toys and the enemies are Battle's own enemy sounds (obstacle_0 to obstacle_9, in the
battle pack); the wrong buzz and the twinkle are the events' (js/modes/toymemory.js).
"""
import hashlib, json, os, struct, subprocess, sys
import numpy as np

RATE = 44100
MAGIC = b'ELPACK1\n'

# name: (original, start s, end s, loop, rms dB, mono, crossfade s for a loop)
SOUNDS = {
    # The relaxing ambience, looped: "Zen Fountain Ambience" by Alex_Jauk (Pixabay 210613),
    # 1.0 to 41.0 s (a steady fountain all through), its last second crossfaded into its
    # first. The original is very quiet (about -40 dB); raised here, a little under the
    # abyss's wind (-25.5), as calm as an island's shore (-27.7).
    'tm_ambience': ('tm_amb_210613.mp3', 1.0, 41.0, True, -26.0, False, 1.0),
    # The music box marking the box: "Music box" by freesound_community (Pixabay 69223),
    # one short phrase, 11.86 to 14.20 s (2.34 s): its first note and the note that follows
    # its end are the same, so it loops with only the ring of its last note carried over
    # (a short crossfade). Mono, a soft beacon (the events' music box is -19 dB).
    'tm_beacon':   ('tm_box_69223.mp3', 11.86, 14.20, True, -22.0, True, 0.12),
    # The box opening: "Wooden Trunk Latch 1" by floraphonic (Pixabay 183944), all of it
    # (0.38 s). Mono, a little under The Edge's one-shots (-20 dB: a sharp click, kept clear of clipping).
    'tm_box_open': ('tm_open_183944.mp3', 0.0, 0.384, False, -20.0, True, 0.0),
}
FADE_OUT = 0.03


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def make(src, a, b, loop, rms_db, mono, xfade):
    x = decode(src)
    if loop:
        # The body is a to b; its opening is the recording just after b fading into the
        # opening at a, so its end runs on into its start without a seam.
        n = int((b - a) * RATE); f = int(xfade * RATE); s = int(a * RATE)
        seg = x[s:s + n + f].copy()
        if len(seg) < n + f:
            raise SystemExit('too short for its loop: ' + src)
        ramp = np.linspace(0, 1, f)[:, None]
        y = seg[:n].copy()
        y[:f] = seg[:f] * ramp + seg[n:n + f] * (1 - ramp)
    else:
        y = x[int(a * RATE):int(b * RATE)].copy()
        edge = int(FADE_OUT * RATE)
        y[-edge:] *= np.linspace(1, 0, edge)[:, None]
    if mono:
        m = y.mean(axis=1)
        y = np.stack([m, m], axis=1)
    y = y * (10 ** (rms_db / 20) / np.sqrt(np.mean(y * y)))
    lim = 10 ** (-1.0 / 20)
    if np.abs(y).max() > lim:            # a soft limit: only the peaks are pressed down
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
    for name, (f, a, b, loop, rms, mono, xf) in SOUNDS.items():
        y = make(os.path.join(src_dir, f), a, b, loop, rms, mono, xf)
        ogg = os.path.join(work, name + '.ogg')
        to_ogg(y, ogg)
        data = open(ogg, 'rb').read()
        entries.append({'kind': 'dry', 'name': name, 'frames': len(y), 'loop': loop, 'offset': off, 'length': len(data)})
        blobs.append(data); off += len(data)
        print(f'{name}: {len(y) / RATE:.2f} s, {len(data)} bytes, {"loop" if loop else "one-shot"}, {"mono" if mono else "stereo"}')
    header = json.dumps({'pack': 'toymemory', 'rate': RATE, 'entries': entries}, separators=(',', ':')).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'toymemory-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    packs = os.path.join(repo, 'packs')
    for old in os.listdir(packs):
        if old.startswith('toymemory-') and old.endswith('.elpack') and old != fname:
            os.remove(os.path.join(packs, old))
    open(os.path.join(packs, fname), 'wb').write(body)
    # (The manifest is read and written at once, so another pack written meanwhile is kept.)
    mpath = os.path.join(packs, 'manifest.json')
    m = json.load(open(mpath))
    m['packs']['toymemory'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh:
        json.dump(m, fh, indent=1)
    print(fname, len(body))


if __name__ == '__main__':
    main()
