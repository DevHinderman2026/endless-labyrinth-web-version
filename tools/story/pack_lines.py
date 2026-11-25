"""Put Story Mode's recordings into packs/story-voice-*.elpack (web 7.3.0).

    python3 tools/story/pack_lines.py <catalog.json> <recordings folder> <web repository folder>

The catalog is tools/story/catalog.mjs's; the recordings are tools/voice/record.py's
(kind 'bella'), one per sentence, named by its fingerprint. A line's sentences are
joined into one recording, with a breath (record.py's SENTENCE_GAP) between them, and
named vc_ plus the line's id, kind 'voice', so the game plays it as it plays the
characters' lines (js/voice.js CastVoices). The name keeps clear of tools/voice/pack.py,
which replaces only the packs whose names start with "voice".
"""
import hashlib, importlib.util, json, os, struct, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('record_voice', os.path.join(HERE, '..', 'voice', 'record.py'))
rec = importlib.util.module_from_spec(spec); spec.loader.exec_module(rec)
MAGIC = b'ELPACK1\n'


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(rec.RATE), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4')


def joined(paths):
    gap = np.zeros(int(round(rec.SENTENCE_GAP * rec.RATE)), dtype=np.float32)
    parts = []
    for i, p in enumerate(paths):
        if i: parts.append(gap)
        parts.append(decode(p))
    y = np.clip(np.concatenate(parts), -1, 1)
    return subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(rec.RATE), '-ac', '1', '-i', '-', '-c:a', 'libvorbis', '-q:a', rec.QUALITY,
                           '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'ogg', '-'],
                          input=y.astype('<f4').tobytes(), capture_output=True, check=True).stdout


def main():
    cat_path, rec_dir, repo = sys.argv[1:4]
    cat = json.load(open(cat_path, encoding='utf-8'))
    by_name = {c['name']: c for c in cat['bella']}
    entries = []; blobs = []; off = 0
    for ln in cat['lines']:
        data = joined([os.path.join(rec_dir, rec.fingerprint('bella', by_name[n]) + '.ogg') for n in ln['parts']])
        entries.append({'name': 'vc_' + ln['id'], 'kind': 'voice', 'frames': 0, 'loop': False, 'offset': off, 'length': len(data)})
        blobs.append(data); off += len(data)
    header = json.dumps({'pack': 'story-voice', 'rate': rec.RATE, 'entries': entries}, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'story-voice-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    packs = os.path.join(repo, 'packs')
    for old in os.listdir(packs):
        if old.startswith('story-voice-') and old != fname: os.remove(os.path.join(packs, old))
    open(os.path.join(packs, fname), 'wb').write(body)
    mpath = os.path.join(packs, 'manifest.json')
    m = json.load(open(mpath))
    m['packs']['story-voice'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh: json.dump(m, fh, indent=1)
    print(fname, len(body), len(entries), 'lines')


if __name__ == '__main__':
    main()
