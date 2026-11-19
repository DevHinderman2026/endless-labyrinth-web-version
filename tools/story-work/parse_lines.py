import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
KIND = {'^': 'greeting', '<': 'callback', '+': 'gift', '~': 'story'}
def load(cid):
    out = []
    for raw in open(os.path.join(HERE, 'lines', cid + '.txt'), encoding='utf-8'):
        s = raw.strip()
        if not s or s.startswith('#'):
            continue
        k = KIND.get(s[0])
        if k:
            s = s[1:].strip(); hint = False
        else:
            k = 'story'; hint = True
        out.append((k, hint, s))
    return out
def all_ids():
    return sorted(f[:-4] for f in os.listdir(os.path.join(HERE, 'lines')) if f.endswith('.txt'))
if __name__ == '__main__':
    tot = {}
    for cid in all_ids():
        L = load(cid); c = {}
        for k, h, s in L:
            key = 'hint' if h else k
            c[key] = c.get(key, 0) + 1
        st = c.get('hint', 0) + c.get('story', 0)
        print(f"{cid:14s} greet {c.get('greeting',0):3d} cb {c.get('callback',0):3d} gift {c.get('gift',0):3d} story {st:3d} (hints {c.get('hint',0)})")
        for k, v in c.items(): tot[k] = tot.get(k, 0) + v
    print(tot, 'story total', tot['hint'] + tot['story'])
