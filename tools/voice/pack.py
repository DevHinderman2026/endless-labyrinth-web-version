"""Put the voice recordings into the web version's sound packs (web 6.1.0).

Run in Claude's workspace after tools/voice/record.py:

    python3 tools/voice/pack.py <catalog.json> <recordings folder> <web repository folder>

Writes packs/voice-bella-*.elpack, packs/voice-guide-*.elpack and
packs/voice-cast*-*.elpack (the characters' lines in parts, so no file comes near
GitHub's 50 MB warning), adds them to packs/manifest.json (removing older voice packs
it named), and writes tools/voice/voice-lines.json: the list of every recording
with its text and where the text comes from, for reading and for the tests; and
tools/voice/recordings.json, which recording each pack entry is, for unpack.py.

A pack is the same format as the other sound packs (js/packs.js): 'ELPACK1\\n', the
length of a JSON index, the index, then each file. Each recording's entry has kind
'voice' and frames 0 (the decoded length is kept as it is); Bella's also say which
words they say (key), whether they were said as a sentence's end (end) and what
kind they are (k: 'line', 'num' or 'word'), which js/voice-text.js matches lines to.
A pack's name ends with a fingerprint of its bytes, so a pack that has not changed
keeps its name and is never downloaded again.
"""
import hashlib
import importlib.util
import json
import os
import struct
import sys

# The recordings are named by record.py's fingerprint of what made them.
_spec = importlib.util.spec_from_file_location('record_voice', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'record.py'))
_rec = importlib.util.module_from_spec(_spec)
try:
    _spec.loader.exec_module(_rec)
    fingerprint = _rec.fingerprint
except ImportError:                     # (record.py needs ONNX Runtime; its fingerprint does not)
    raise SystemExit('pack.py needs record.py beside it, and numpy and onnxruntime to load it')

MAGIC = b'ELPACK1\n'
PART_BYTES = 22 * 1024 * 1024


def write_pack(name, items, packs_dir):
    entries = []
    blobs = []
    offset = 0
    for entry, path in items:
        data = open(path, 'rb').read()
        e = dict(entry)
        e.update({'kind': 'voice', 'frames': 0, 'loop': False, 'offset': offset, 'length': len(data)})
        entries.append(e)
        blobs.append(data)
        offset += len(data)
    header = json.dumps({'pack': name, 'rate': 24000, 'entries': entries}, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    body = MAGIC + struct.pack('<I', len(header)) + header + b''.join(blobs)
    fp = hashlib.sha1(body).hexdigest()[:10]
    fname = f'{name}-{fp}.elpack'
    with open(os.path.join(packs_dir, fname), 'wb') as f:
        f.write(body)
    return fname, len(body)


def main():
    cat_path, rec_dir, web = sys.argv[1:4]
    cat = json.load(open(cat_path, encoding='utf-8'))
    packs_dir = os.path.join(web, 'packs')
    manifest_path = os.path.join(packs_dir, 'manifest.json')
    manifest = json.load(open(manifest_path))
    old = {k: v for k, v in manifest['packs'].items() if k.startswith('voice')}
    for k in old:
        del manifest['packs'][k]

    def items(kind, prefix, extra):
        out = []
        for c in cat[kind]:
            path = os.path.join(rec_dir, f'{fingerprint(kind, c)}.ogg')
            if not os.path.exists(path):
                raise SystemExit(f'no recording for {kind} {c["name"]}: {c["text"]}')
            e = {'name': prefix + (c['name'][1:] if kind == 'bella' else str(c['id']))}
            e.update(extra(c))
            out.append((e, path))
        return out

    groups = [
        ('voice-bella', items('bella', 'vb_', lambda c: {'key': c['key'], 'end': c['end'], 'k': c['kind']})),
        ('voice-guide', items('guide', 'vg_', lambda c: {})),
    ]
    cast = items('cast', 'vc_', lambda c: {})
    part = []
    size = 0
    n = 1
    for it in cast:
        b = os.path.getsize(it[1])
        if part and size + b > PART_BYTES:
            groups.append(('voice-cast' + ('' if n == 1 else str(n)), part))
            part, size, n = [], 0, n + 1
        part.append(it)
        size += b
    if part:
        groups.append(('voice-cast' + ('' if n == 1 else str(n)), part))
    written = []
    for name, its in groups:
        fname, nbytes = write_pack(name, its, packs_dir)
        manifest['packs'][name] = {'file': fname, 'bytes': nbytes}
        written.append(fname)
        print(f'{fname}: {len(its)} recordings, {nbytes / 1e6:.1f} MB')
    for k, v in old.items():
        if v['file'] not in written:
            try:
                os.remove(os.path.join(packs_dir, v['file']))
            except FileNotFoundError:
                pass
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    # The readable list.
    lines = {
        'about': 'Every recording of the game\'s voices (web 6.1.0; tools/voice/catalog.mjs). bella: the game\'s voice during a run '
                 '(kind line: text of the game; num: a number; word: a word on its own, for joining); guide: the Find the Voice guide; '
                 'cast: the safe zone characters. name is the recording\'s name in the voice packs.',
        'bella': [{'name': 'vb_' + c['name'][1:], 'kind': c['kind'], 'end': c['end'], 'text': c['text'], 'from': c['from']} for c in cat['bella']],
        'guide': [{'name': f"vg_{c['id']}", 'text': c['text']} for c in cat['guide']],
        'cast': [{'name': f"vc_{c['id']}", 'voice': c['voice'], 'text': c['text']} for c in cat['cast']],
    }
    with open(os.path.join(web, 'tools', 'voice', 'voice-lines.json'), 'w', encoding='utf-8') as f:
        json.dump(lines, f, indent=0, ensure_ascii=False)
        f.write('\n')
    # Which recording each pack entry is (record.py's fingerprint of what made it), so
    # the recordings can be taken out of the packs again in a later session
    # (tools/voice/unpack.py) and only what is new has to be recorded.
    prints = {}
    for kind, prefix in (('bella', 'vb_'), ('guide', 'vg_'), ('cast', 'vc_')):
        for c in cat[kind]:
            prints[prefix + (c['name'][1:] if kind == 'bella' else str(c['id']))] = fingerprint(kind, c)
    with open(os.path.join(web, 'tools', 'voice', 'recordings.json'), 'w', encoding='utf-8') as f:
        json.dump(prints, f, indent=0, sort_keys=True)
        f.write('\n')


if __name__ == '__main__':
    main()
