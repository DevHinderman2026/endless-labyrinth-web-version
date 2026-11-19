"""Builds the safe zone cast and story lines for Endless Labyrinth web 6.0.0.

Inputs (all in this folder): cast.py, lines/<character>.txt, lex/us_*.txt (hand-written
American Misaki pronunciations, shorthand: ' = primary stress, , = secondary, g = ɡ, r = ɹ),
lex/gb_overrides.txt (hand-written British entries), and Escape the Cave's cave_lexicon.py
(read only; its entries are the base the story lexicon starts from).
British pronunciations are made from the American entry by the written rules in us_to_gb()
unless gb_overrides.txt has the word.
"""
import glob, importlib.util, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from parse_lines import load
import cast as CASTMOD

HOME = os.path.expanduser('~')
REPO = os.path.join(HOME, 'mnt', 'Documents Local', 'endless-labyrinth-web-version')
CAVE = os.path.join(HOME, 'mnt', 'Documents Local', 'Escape the Cave', 'Dev Builds', 'cave_lexicon.py')
spec = importlib.util.spec_from_file_location('cave_lexicon', CAVE)
cave = importlib.util.module_from_spec(spec); spec.loader.exec_module(cave)

VOCAB = set(";:,.!?—…\"()“” ̃ʣʥʦʨᵝꭧAIOQSTWYᵊabcdefhijklmnopqrstuvwxyzɑɐɒæβɔɕçɖðʤəɚɛɜɟɡɥɨɪʝɯɰŋɳɲɴøɸθœɹɾɻʁɽʂʃʈʧʊʋʌɣɤχʎʒʔˈˌːʰʲ↓→↗↘ᵻ")
US_ONLY = set('æOɾᵻ'); GB_ONLY = set('aQɒː')
VOWELS = set('AIOQWYaeiouɑɐɒæɔəɚɛɜɪʊʌᵻᵊ')

def expand(s):
    return s.replace("'", 'ˈ').replace(',', 'ˌ').replace('g', 'ɡ').replace('r', 'ɹ')

def read_table(pattern):
    out = {}
    for path in sorted(glob.glob(os.path.join(HERE, 'lex', pattern))):
        for n, raw in enumerate(open(path, encoding='utf-8'), 1):
            s = raw.strip()
            if not s or s.startswith('#'):
                continue
            word, ph = s.split(None, 1)
            if word in out and out[word] != expand(ph):
                print(f'NOTE {os.path.basename(path)}:{n} {word} given twice, last one kept')
            out[word] = expand(ph.strip())
    return out

US = dict(cave.LEXICON)
US.update(read_table('us_*.txt'))
US['use'] = 'jˈuz'          # every "use" in the story lines is the verb
LETTERS = dict(cave.LETTERS)

# ---------------------------------------------------------------- American to British
BATH = re.compile(r'^(after|afternoon|afterwards|ask|asked|asking|asks|last|lasted|lasts|past|fast|faster|glass|hourglass|grass|class|pass|passed|passes|passing|password|path|paths|bath|rather|answer|answered|answers|dance|danced|dances|dancing|chance|branch|branches|plant|planted|planting|plants|master|vast|task|basket|staff|can\'t|half|halfway|laugh|laughed|laughing|laughter|draft|drafts|broadcast|broadcasting|commander|flask|cast|castle|example|nasty|mask|aunt)$')
PALM = {'calm', 'calmer', 'palms', 'lava', 'lava\'s', 'ah', 'ha', 'da', 'ta', 'grandpa', 'grandfather', 'father', 'mirage', 'drama', 'spa'}
CLOTH_EXCEPT = {'sauce', 'exhaust', 'cause', 'applause', 'pause'}
YOD = re.compile(r'(tune|tunes|tuning|tuesday|new|newest|news|knew|stew|duet|dunes|overdue)$')

def us_to_gb(word, us):
    s = us
    nxt_vowel = lambda i: i < len(s) and s[i] in VOWELS
    out = []; i = 0
    while i < len(s):
        c = s[i]
        if c == 'ɹ':
            prev = out[-1] if out else ''
            pre = nxt_vowel(i + 1)
            if prev in ('ɑ', 'ɔ', 'ɜ'):
                if prev == 'ɑ' and pre:
                    out[-1] = 'ɒ'; out.append('ɹ')         # sorry, borrow, tomorrow
                else:
                    out.append('ː')
                    if pre: out.append('ɹ')                 # story, stirring
            elif prev in ('ɪ', 'ɛ', 'ʊ'):
                if prev == 'ɛ' and pre:
                    out.append('ɹ')                         # very, ferry (hand list fixes fairy-type words)
                else:
                    out.append('ə')
                    if pre: out.append('ɹ')                 # hearing, curious
            elif prev == 'ə':
                if pre: out.append('ɹ')                     # different
            else:
                out.append('ɹ')
            i += 1; continue
        out.append(c); i += 1
    s = ''.join(out)
    s = s.replace('ɾ', 't').replace('ᵻ', 'ɪ').replace('O', 'Q')
    # BATH words: the first stressed æ becomes ɑː
    if BATH.match(word):
        s = re.sub(r'([ˈˌ][^AIOQWYaeiouɑɐɒæɔəɛɜɪʊʌᵻᵊ]*)æ', r'\1ɑː', s, count=1) if re.search('[ˈˌ]', s.split('æ')[0] + 'æ') else s.replace('æ', 'ɑː', 1)
    s = s.replace('æ', 'a')
    # ɑ: PALM words keep a long ɑː, everything else is the short ɒ of "lot"
    res = []
    for k, c in enumerate(s):
        if c == 'ɑ' and (k + 1 >= len(s) or s[k + 1] != 'ː'):
            res.append('ɑː' if word in PALM else 'ɒ')
        elif c == 'ɔ' and (k + 1 >= len(s) or s[k + 1] != 'ː'):
            nx = s[k + 1] if k + 1 < len(s) else ''
            res.append('ɒ' if nx in ('f', 'θ', 's', 'ŋ', 'ɡ') and word not in CLOTH_EXCEPT else 'ɔː')
        else:
            res.append(c)
    s = ''.join(res)
    # i and u are long in a stressed syllable
    res = []; stressed = False
    for c in s:
        if c in 'ˈˌ':
            stressed = True
        if c in ('i', 'u') and stressed:
            res.append(c + 'ː')
        else:
            res.append(c)
        if c in VOWELS:
            stressed = False
    s = ''.join(res).replace('ːː', 'ː')
    if YOD.match(word):
        s = re.sub(r'([tdn])([ˈˌ]?)uː', r'\1j\2uː', s, count=1)
    return s

GB_OVER = read_table('gb_overrides.txt')
def gb_of(word):
    if word in GB_OVER: return GB_OVER[word]
    if word.startswith('letter:'): return us_to_gb(word, LETTERS[word[7:]])
    if word in US: return us_to_gb(word, US[word])
    return None

# ---------------------------------------------------------------- composing a line
TOK = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)*(?:\|[a-z]+)?|[.,!?;:]")
def key_of(t):
    w, _, tag = t.partition('|')
    if tag == 'letter' or (len(w) == 1 and w not in ('a', 'A', 'I')):
        return 'letter:' + w.lower()
    return w.lower() + ('|' + tag if tag else '')

def display(text):
    return re.sub(r"\|[a-z]+", '', text)

def lookup(key, accent):
    if accent == 'gb':
        return gb_of(key)
    if key.startswith('letter:'):
        return LETTERS.get(key[7:])
    return US.get(key)

def starts_vowel(ph):
    for ch in ph:
        if ch in 'ˈˌ': continue
        return ch in VOWELS
    return False

def compose(text, accent):
    items = []; missing = []
    for t in TOK.findall(text):
        if t in '.,!?;:':
            items.append(('p', t)); continue
        k = key_of(t); ph = lookup(k, accent)
        if ph is None:
            missing.append(k); continue
        items.append(('w', ph, k))
    if missing: return None, missing
    out = []
    words = [x for x in items if x[0] == 'w']
    wi = 0
    for idx, it in enumerate(items):
        if it[0] == 'p':
            out.append(it[1]); continue
        ph, k = it[1], it[2]
        nxt = next((x for x in items[idx + 1:] if x[0] == 'w'), None)
        follows_punct = idx + 1 < len(items) and items[idx + 1][0] == 'p'
        if nxt is not None and not follows_punct:
            if k == 'the' and starts_vowel(nxt[1]): ph = 'ði'
            elif k == 'to' and starts_vowel(nxt[1]): ph = 'tʊ'
        if out: out.append(' ')
        out.append(ph)
    return ''.join(out), []

if __name__ == '__main__':
    import collections
    cast = CASTMOD.CAST
    lines_out = []; missing_all = collections.Counter(); bad_sym = []
    for cid, name, voice, group, bgs, pers in cast:
        accent = 'gb' if voice.startswith('b') else 'us'
        counters = collections.Counter()
        for kind, hint, text in load(cid):
            t = 'story-hint' if hint else kind
            short = {'greeting': 'greet', 'callback': 'call', 'gift': 'gift', 'story': 'story', 'story-hint': 'story'}[t]
            counters[short] += 1
            lid = f'{cid}.{short}.{counters[short]:03d}'
            ph, miss = compose(text, accent)
            for m in miss: missing_all[m] += 1
            shown = display(text)
            entry = {'id': lid, 'character': cid, 'type': t, 'hint': t == 'story-hint', 'text': shown, 'phonemes': ph}
            lines_out.append(entry)
            if ph:
                bad = set(ph) - VOCAB
                wrong = set(ph) & (US_ONLY if accent == 'gb' else GB_ONLY)
                if bad or wrong: bad_sym.append((lid, ''.join(sorted(bad | wrong))))
    if missing_all:
        print('MISSING', len(missing_all)); print(' '.join(sorted(missing_all)))
    if bad_sym:
        print('BAD SYMBOLS', bad_sym[:20])
    if missing_all or bad_sym or '--check' in sys.argv:
        sys.exit(1 if (missing_all or bad_sym) else 0)
    # ------------------------------------------------------------ write the data
    bg_owner = {}
    chars = []
    for cid, name, voice, group, bgs, pers in cast:
        accent = 'gb' if voice.startswith('b') else 'us'
        chars.append({'id': cid, 'name': name, 'voice': voice, 'accent': accent, 'lang': 'en-gb' if accent == 'gb' else 'en-us',
                      'group': group, 'backgrounds': ['evt_amb_' + b for b in bgs], 'personality': pers})
        for b in bgs: bg_owner['evt_amb_' + b] = cid
    castdoc = {'format': 1, 'built': 'web 6.0.0',
               'about': 'Ultimate Mode safe zone characters. Every safe zone background (evt_amb_ name) has exactly one character; each character has its own Kokoro voice. accent gb means the line phonemes are in Misaki British notation (Kokoro lang code b); us means American (lang code a).',
               'groups': [{'id': g, 'name': n, 'backgrounds': [b for c in cast if c[3] == g for b in ['evt_amb_' + x for x in c[4]]]} for g, n in CASTMOD.GROUPS],
               'characters': chars, 'backgroundToCharacter': dict(sorted(bg_owner.items()))}
    linedoc = {'format': 1, 'built': 'web 6.0.0',
               'about': ('Spoken lines of the safe zone characters. type: greeting (said every few seconds from where the character stands, so the player can find them), '
                         'callback (said now and then while the player has walked away before the gift), gift (said when handing over the gift), '
                         'story-hint (a story line that counts as hearing a storyline hint, which the world\'s mercy needs), story (a story line that is not a hint). '
                         'phonemes is the whole line in Kokoro phonemes (Misaki notation, British for gb characters), ready for the model; text is what is shown on a Braille display. '
                         'ids are stable: new lines are only ever added at the end of a character\'s list, so the saved list of heard ids stays valid.'),
               'lines': lines_out}
        # lexicon: every key used, both accents (keys with |tag come from the source text)
    keys = set()
    for cid, *_ in cast:
        for kind, hint, text in load(cid):
            for t in TOK.findall(text):
                if t[0].isalpha(): keys.add(key_of(t))
    lexdoc = {'format': 1, 'about': 'Word table the story lines were composed from. us: hand-written American Misaki entries (Escape the Cave entries reused). gb: British entries, made from the American ones by written rules plus hand-written exceptions. Keys word|tag mark a second pronunciation (read|past, close|adj, used|hab, wind|verb, wound|verb, bow|bend); letter:x is a letter said on its own. Special rules: the before a vowel = ði, to before a vowel = tʊ.',
              'us': {k: lookup(k, 'us') for k in sorted(keys)}, 'gb': {k: lookup(k, 'gb') for k in sorted(keys)}}
    dd = os.path.join(REPO, 'js', 'data'); os.makedirs(dd, exist_ok=True)
    for fn, doc in (('safe-zone-cast.json', castdoc), ('story-lines.json', linedoc), ('story-lexicon.json', lexdoc)):
        with open(os.path.join(dd, fn), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1); f.write('\n')
    print('wrote', len(lines_out), 'lines,', len(keys), 'words')
