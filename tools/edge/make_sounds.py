"""The Edge's recordings (web 8.0.0): cut, levelled and packed.

Run in Claude's workspace (Russell does not run it):

    python3 tools/edge/make_sounds.py <folder of the original Pixabay downloads> <web repository folder>

(8.1.0: the new scream and wind are in Downloads\\abyss-edge-pixabay-2026-11-26.)
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
    # (8.0.1, Russell: the path is gravel, not concrete, and the safe glass must not be a
    # smash: glass set down on gravel, like a cup set down.)
    # The ledge's gravel underfoot, four steps: "Footsteps on Gravel - 1" by DRAGON-STUDIO
    # (Pixabay 397987), each step cut out on its own.
    'ed_step_1':       ('edge_gravel_steps_397987.mp3', 0.50, 1.05, False, -24.0, True),
    'ed_step_2':       ('edge_gravel_steps_397987.mp3', 1.28, 1.78, False, -24.0, True),
    'ed_step_3':       ('edge_gravel_steps_397987.mp3', 2.73, 3.30, False, -24.0, True),
    'ed_step_4':       ('edge_gravel_steps_397987.mp3', 3.40, 3.84, False, -24.0, True),
    # Your glass landing on the gravel one step ahead: safe. A glass cup set down,
    # "setting down glass cup" by freesound_community (93946), its second set-down,
    # with a soft crunch of the same gravel under it (ed_glass_gravel, mixed in below).
    'ed_glass_stone':  ('edge_glass_cup_93946.mp3', 3.63, 4.30, False, -17.0, True),
    'ed_glass_gravel': ('edge_gravel_steps_397987.mp3', 1.29, 1.96, False, -27.0, True),
    # Glass flying out over the edge: "Simple Whoosh" by DRAGON-STUDIO (382724).
    'ed_glass_whoosh': ('edge_whoosh_382724.mp3', 0.0, 0.57, False, -17.0, True),
    # The glass breaking far below: "glass break 3" by freesound_community (102271);
    # the game plays it faint (edge.js ED_DROP_LEVEL).
    'ed_glass_below':  ('edge_below_102271.mp3', 0.0, 0.96, False, -18.0, True),
    # A loose stone kicked off the edge, tumbling away: "Rocks Falling" by
    # freesound_community (44890), its first 1.6 seconds.
    'ed_kick':         ('edge_kick_44890.mp3', 0.0, 1.6, False, -18.0, True),
    # (8.1.0, Russell, 26 November 2026.) A man's scream as you fall: "052663_Man falling."
    # by freesound_community (Pixabay 85712), replacing "Male Falling Scream" by Universfield
    # (326183). In The Edge itself: its first eight seconds, fading away as you fall
    # (ED_FALL_TIME); cut before the end, where the recording's impact is meant to be. In a
    # Chaos fall, where you land on the abyss's glass floor: the whole recording, impact
    # and all, eleven and a half seconds (ED_CHAOS_FALL_SECONDS).
    'ed_scream':       ('edge_scream_85712.mp3', 0.15, 8.15, False, -16.0, False),
    'ed_scream_whole': ('edge_scream_85712.mp3', 0.15, 11.65, False, -16.0, False),
    # The rush of air as you fall, as long as the scream: "Blizzard Wind" by DRAGON-STUDIO
    # (463217), strong and steady for its first twelve seconds (8.1.0, Russell chose a
    # longer wind recording over looping the old whoosh). Until 8.1.0: "Simple Whoosh 02"
    # by DRAGON-STUDIO (433006), 0.35 to 2.85 s.
    'ed_fall':         ('edge_fall_wind_463217.mp3', 0.0, 8.0, False, -19.0, False),
    'ed_fall_whole':   ('edge_fall_wind_463217.mp3', 0.0, 11.5, False, -19.0, False),
    # (8.1.1, Russell, 26 November 2026: the scream has no impact at its end, so a Chaos
    # fall needs a landing of its own.) Landing on the abyss's glass floor at the end of a
    # Chaos fall: "Heavy Body Fall" by Universfield (Pixabay 352446), Russell's pick, with a
    # crunch of the floor's own broken glass under it: two of The Abyss's glass footsteps
    # (ut_glass_step_1 and _3, from the ultimate pack), the second a moment after the first.
    'ed_land':         ('edge_land_352446.mp3', 0.15, 2.3, False, -15.0, False),
    'ed_land_glass1':  ('pack:ultimate:ut_glass_step_1', 0.0, 0.68, False, -19.0, False),
    'ed_land_glass3':  ('pack:ultimate:ut_glass_step_3', 0.0, 0.72, False, -21.0, False),
}
XFADE = 1.0
FADE_OUT = {'edge_glass_cup_93946.mp3': 0.15, 'edge_gravel_steps_397987.mp3': 0.08, 'edge_kick_44890.mp3': 0.5}
# A fade of a sound's own, over its file's (8.1.0: two cuts of one recording fade differently).
# The Edge's scream and air fade away over their last second and a half, as you fall away.
FADE_NAMED = {'ed_scream': 1.5, 'ed_fall': 1.5, 'ed_scream_whole': 0.4, 'ed_fall_whole': 1.0, 'ed_land': 0.4}
FADE_IN_NAMED = {'ed_fall': 0.3, 'ed_fall_whole': 0.3}
# Sounds made of two or more: (name, [parts], rms dB). A part is a name, or (name, seconds
# it starts late). The parts are not packed on their own. (8.1.1: the mix is as long as its
# longest part, the others padded with silence; ed_glass_stone's two parts are the same length.)
MIXES = [('ed_glass_stone', ['ed_glass_stone', 'ed_glass_gravel'], -18.0),
         ('ed_land', ['ed_land', 'ed_land_glass1', ('ed_land_glass3', 0.09)], -15.0)]


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
