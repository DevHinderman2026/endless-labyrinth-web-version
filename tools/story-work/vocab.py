import re, collections, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_lines import load, all_ids
TOK = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)*(?:\|[a-z]+)?|[.,!?;:]")
def key_of(t):
    w, _, tag = t.partition('|')
    if tag == 'letter' or (len(w) == 1 and w not in ('a', 'A', 'I')):
        return 'letter:' + w.lower()
    return w.lower() + ('|' + tag if tag else '')
def vocab():
    c = collections.Counter(); who = collections.defaultdict(set)
    for cid in all_ids():
        for k, h, s in load(cid):
            for t in TOK.findall(s):
                if t[0].isalpha():
                    kk = key_of(t); c[kk] += 1; who[kk].add(cid)
    return c, who
