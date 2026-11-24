"""Turn tools/museum/lines.py into js/data/museum-lines.json, with each line's phonemes.

    python3 tools/museum/make_lines.py <web repository folder>

The phonemes are Misaki notation (Kokoro's), word by word from the story lexicon the
safe zone lines were made with (js/data/story-lexicon.json: American and British), plus
the hand-written words in museum_lexicon below (American, British), and the rules the
story lines follow: "the" is ði before a vowel, "to" is tʊ before a vowel, "used to" is
jˈust, and a few words that change with their meaning are fixed by hand per line
(FIXES). A word with no pronunciation stops the script: add it to museum_lexicon.
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lines import LINES, KINDS

VOW = set('AIOQWYaeiouɑɐɒæɔəɚɛɜɪʊʌᵻᵊ')

# Words the story lexicon does not have: (American, British).
museum_lexicon = {}
for raw in open(os.path.join(HERE, 'museum_lexicon.txt'), encoding='utf-8'):
    s = raw.strip()
    if not s or s.startswith('#'):
        continue
    w, us, gb = s.split('\t')
    museum_lexicon[w] = (us, gb)

# (line id, word, American, British): a word read another way in this line.
FIXES = [
    ('museum.librarian.memory.1', 'read', 'ɹˈɛd', 'ɹˈɛd'),
    ('museum.librarian.memory.2', 'read', 'ɹˈɛd', 'ɹˈɛd'),
    ('museum.gravekeeper.call.4', 'close', 'klˈOs', 'klˈQs'),
    ('museum.caver.call.4', 'closer', 'klˈOsəɹ', 'klˈQsə'),
    ('museum.fiddler.memory.5', 'storm', 'stˈɔɹm', 'stˈɔːm'),
]


def phonemes(text, acc, lex, line_id):
    d = lex[acc]
    fix = {w: (u if acc == 'us' else g) for (i, w, u, g) in FIXES if i == line_id}
    toks = re.findall(r"[A-Za-z']+|[.,!?;:—…\"()]", text)
    out = []; words = []
    for t in toks:
        if re.match(r"[A-Za-z']", t):
            w = t.lower().strip("'")
            words.append(w)
            if w in fix: out.append(fix[w])
            elif w in museum_lexicon: out.append(museum_lexicon[w][0 if acc == 'us' else 1])
            elif w in d: out.append(d[w])
            else: raise KeyError(w)
        elif out:
            out[-1] += t
    for i in range(len(out) - 1):
        nxt = out[i + 1].lstrip('ˈˌ')
        if out[i] == 'ðə' and nxt[:1] in VOW: out[i] = 'ði'
        if out[i] == 'tə' and nxt[:1] in VOW: out[i] = 'tʊ'
        if words[i] == 'used' and i + 1 < len(words) and words[i + 1] == 'to':
            out[i] = 'jˈust' if acc == 'us' else 'jˈuːst'
    return ' '.join(out).strip()


def main():
    repo = sys.argv[1]
    lex = json.load(open(os.path.join(repo, 'js/data/story-lexicon.json'), encoding='utf-8'))
    cast = {c['id']: c for c in json.load(open(os.path.join(repo, 'js/data/safe-zone-cast.json'), encoding='utf-8'))['characters']}
    out = []; missing = {}
    for cid, kinds in LINES.items():
        if cid not in cast: raise SystemExit('no such character: ' + cid)
        acc = cast[cid]['accent']
        for kind, n in KINDS.items():
            lst = kinds.get(kind, [])
            if len(lst) != n: raise SystemExit(f'{cid} {kind}: {len(lst)} lines, wants {n}')
            for i, text in enumerate(lst, 1):
                lid = f'museum.{cid}.{kind}.{i}'
                try:
                    ph = phonemes(text, acc, lex, lid)
                except KeyError as e:
                    missing.setdefault(e.args[0], set()).add(acc); continue
                out.append({'id': lid, 'character': cid, 'type': kind, 'n': i, 'text': text, 'phonemes': ph})
    if missing:
        for w in sorted(missing): print('MISSING', w, ','.join(sorted(missing[w])))
        raise SystemExit(f'{len(missing)} words have no pronunciation')
    missing_chars = set(cast) - set(LINES)
    if missing_chars: raise SystemExit('characters with no museum lines: ' + ', '.join(sorted(missing_chars)))
    doc = {'format': 1, 'built': 'web 7.2.0',
           'about': "The Museum's character lines (tools/museum/lines.py). type: intro (as their museum begins), call (from beside the memory they want found), pool (near a bottomless pool's edge), fiery (a fiery memory's firework: stamp out the sparks), memory (said as the nth memory is found, n 1 to 8), open (every memory found: go to the door), goodbye (out of the door: they are free). phonemes: Misaki notation, British for gb characters. Each line is a recording in the character's own Kokoro voice, named vc_ plus its id, in the museum-voice pack.",
           'lines': out}
    with open(os.path.join(repo, 'js/data/museum-lines.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(len(out), 'lines')


if __name__ == '__main__':
    main()
