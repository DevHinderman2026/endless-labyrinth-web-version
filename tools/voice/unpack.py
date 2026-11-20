"""Take the voice recordings back out of the web version's voice packs (web 6.1.0).

Run in Claude's workspace at the start of a later recording session, before
catalog.mjs, record.py and pack.py:

    python3 tools/voice/unpack.py <web repository folder> <recordings folder>

The packs hold every recording, and tools/voice/recordings.json (written by pack.py)
says which recording each pack entry is: record.py's fingerprint of the voice, the
phonemes and the loudness that made it. This writes each one to the recordings
folder under that fingerprint, <fingerprint>.ogg, exactly as record.py left it. Then
record.py makes only the recordings that are not there (new lines, or lines whose
pronunciation changed), and pack.py builds the packs from all of them. So the four
and a half thousand recordings never have to be made again.
"""
import json
import os
import struct
import sys

MAGIC = b'ELPACK1\n'


def main():
    web, out = sys.argv[1:3]
    packs = os.path.join(web, 'packs')
    prints = json.load(open(os.path.join(web, 'tools', 'voice', 'recordings.json'), encoding='utf-8'))
    manifest = json.load(open(os.path.join(packs, 'manifest.json')))
    os.makedirs(out, exist_ok=True)
    written = 0
    unknown = 0
    for name, p in manifest['packs'].items():
        if not name.startswith('voice'):
            continue
        data = open(os.path.join(packs, p['file']), 'rb').read()
        if data[:8] != MAGIC:
            raise SystemExit('not a sound pack: ' + p['file'])
        n = struct.unpack('<I', data[8:12])[0]
        head = json.loads(data[12:12 + n].decode('utf-8'))
        base = 12 + n
        for e in head['entries']:
            fp = prints.get(e['name'])
            if not fp:
                unknown += 1
                continue
            path = os.path.join(out, fp + '.ogg')
            if not os.path.exists(path):
                with open(path, 'wb') as f:
                    f.write(data[base + e['offset']:base + e['offset'] + e['length']])
                written += 1
    print(f'{written} recordings written to {out}' + (f'; {unknown} pack entries not in recordings.json' if unknown else ''))


if __name__ == '__main__':
    main()
