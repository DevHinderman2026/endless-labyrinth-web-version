"""The Abyss's thunderclaps (web 8.1.0): one recording replaced in the abyss pack.

Run in Claude's workspace (Russell does not run it):

    python3 tools/abyss/thunder.py <folder of the original Pixabay downloads> <web repository folder>

Russell, 26 November 2026: thunder 4 ("big thunder clap" by freesound_community, 99753)
is taken out of The Abyss, and "BIG THUNDER recorded in stereo with rain fall and
lightning" by rcroller (Freesound), freesound_community on Pixabay (67697), takes its
place, cut to about six seconds. The original MP3, exactly as downloaded, is kept on
Russell's computer in Downloads\\abyss-edge-pixabay-2026-11-26.

The cut: its opening clap, which starts out of silence at 0.2 s and rolls on loud for
a second, and the rumble after it, six seconds in all, with a short fade at the end;
set to full level (peaks just under -0.5 dB) like the other thunderclaps, Ogg Vorbis,
two channels, 44,100 a second. It goes in the pack as ab_thunder_5 (a new name: thunder
4 is no longer in the game), every other recording of the pack copied over as it is,
and packs/manifest.json names the new pack (the old one removed).
"""
import hashlib, json, os, struct, subprocess, sys
import numpy as np

RATE = 44100
MAGIC = b'ELPACK1\n'
DROP = ['ab_thunder_4']
# name: (original, start s, end s, fade out s)
NEW = {'ab_thunder_5': ('abyss_thunder_67697.mp3', 0.15, 6.15, 0.8)}
PEAK_DB = -0.5


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def make(src, a, b, fade):
    y = decode(src)[int(a * RATE):int(b * RATE)].copy()
    fin = int(0.01 * RATE)
    y[:fin] *= np.linspace(0, 1, fin)[:, None]
    n = int(fade * RATE)
    y[-n:] *= np.linspace(1, 0, n)[:, None]
    y *= 10 ** (PEAK_DB / 20) / np.abs(y).max()
    return y.astype(np.float32)


def to_ogg(y, out):
    tmp = out + '.raw'
    y.astype('<f4').tofile(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i', tmp, '-c:a', 'libvorbis',
                    '-q:a', '4', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'ogg', out], check=True)
    os.remove(tmp)


def main():
    src_dir, repo = sys.argv[1:3]
    packs = os.path.join(repo, 'packs')
    mpath = os.path.join(packs, 'manifest.json')
    man = json.load(open(mpath))
    old = man['packs']['abyss']['file']
    buf = open(os.path.join(packs, old), 'rb').read()
    n = struct.unpack('<I', buf[8:12])[0]
    head = json.loads(buf[12:12 + n]); base = 12 + n
    entries = []; blobs = []; off = 0
    for e in head['entries']:
        if e['name'] in DROP or e['name'] in NEW:
            continue
        data = buf[base + e['offset']:base + e['offset'] + e['length']]
        entries.append({**e, 'offset': off}); blobs.append(data); off += len(data)
    work = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'finished')
    os.makedirs(work, exist_ok=True)
    for name, (f, a, b, fade) in NEW.items():
        y = make(os.path.join(src_dir, f), a, b, fade)
        ogg = os.path.join(work, name + '.ogg')
        to_ogg(y, ogg)
        data = open(ogg, 'rb').read()
        entries.append({'kind': 'dry', 'name': name, 'frames': len(y), 'loop': False, 'offset': off, 'length': len(data)})
        blobs.append(data); off += len(data)
        rms = 20 * np.log10(np.sqrt(np.mean(y.astype(np.float64) ** 2)))
        print(f'{name}: {len(y) / RATE:.2f} s, {len(data)} bytes, rms {rms:.1f} dB')
    header = json.dumps({'pack': 'abyss', 'rate': RATE, 'entries': entries}, separators=(',', ':')).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'abyss-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    for f in os.listdir(packs):
        if f.startswith('abyss-') and f.endswith('.elpack') and f != fname:
            os.remove(os.path.join(packs, f))
    open(os.path.join(packs, fname), 'wb').write(body)
    man['packs']['abyss'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh:
        json.dump(man, fh, indent=1)
    print(fname, len(body))


if __name__ == '__main__':
    main()
