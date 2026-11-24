"""Put the Museum's recordings into packs/museum-voice-*.elpack (web 7.2.0).

    python3 tools/museum/pack_lines.py <catalog.json> <recordings folder> <web repository folder>

The catalog is tools/museum/catalog.mjs's; the recordings are tools/voice/record.py's,
named by its fingerprint. Each entry is named vc_ plus the line's id, kind 'voice', so
the voice module finds it as one of a character's lines (js/voice.js CastVoices).
"""
import hashlib, importlib.util, json, os, struct, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('record_voice', os.path.join(HERE, '..', 'voice', 'record.py'))
rec = importlib.util.module_from_spec(spec); spec.loader.exec_module(rec)
MAGIC = b'ELPACK1\n'


def main():
    cat_path, rec_dir, repo = sys.argv[1:4]
    cat = json.load(open(cat_path, encoding='utf-8'))
    entries = []; blobs = []; off = 0
    for c in cat['cast']:
        data = open(os.path.join(rec_dir, rec.fingerprint('cast', c) + '.ogg'), 'rb').read()
        entries.append({'name': c['name'], 'kind': 'voice', 'frames': 0, 'loop': False, 'offset': off, 'length': len(data)})
        blobs.append(data); off += len(data)
    header = json.dumps({'pack': 'museum-voice', 'rate': 24000, 'entries': entries}, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fname = 'museum-voice-' + hashlib.sha1(body).hexdigest()[:10] + '.elpack'
    packs = os.path.join(repo, 'packs')
    for old in os.listdir(packs):
        if old.startswith('museum-voice-') and old != fname: os.remove(os.path.join(packs, old))
    open(os.path.join(packs, fname), 'wb').write(body)
    mpath = os.path.join(packs, 'manifest.json')
    m = json.load(open(mpath))
    m['packs']['museum-voice'] = {'file': fname, 'bytes': len(body)}
    with open(mpath, 'w') as fh: json.dump(m, fh, indent=1)
    print(fname, len(body), len(entries), 'recordings')


if __name__ == '__main__':
    main()
