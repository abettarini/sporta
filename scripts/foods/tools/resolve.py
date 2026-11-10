# Legge seed/*.txt, risolve la fonte (codice CIQUAL o ricerca "q:"), stampa gli abbinamenti per la revisione
# e scrive foods-resolved.json. Uso: python3 tools/resolve.py [file1 file2 …] (default: tutti)
import json, sys, glob, re, os
idx = json.load(open('ciqual-index.json'))
usda = json.load(open('usda-index.json')) if os.path.exists('usda-index.json') else {}
NUT = ['kcal', 'prot', 'carb', 'sugar', 'fat', 'sat', 'fiber', 'salt']

def search(q):
    words = q.lower().split()
    res = [v for v in idx.values() if all(w in (v['en'] + ' | ' + v['fr']).lower() for w in words) and v['kcal'] is not None]
    if not res: return None
    # preferenza: crudo / non cotto, nome più corto
    def score(v):
        en = v['en'].lower()
        return (('cooked' in en or 'boiled' in en or 'fried' in en) and 'raw' not in q, len(en))
    return sorted(res, key=score)[0]

def parse(path):
    out = []
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'): continue
        parts = [p.strip() for p in line.split('|')]
        while len(parts) < 5: parts.append('')
        name, dep, src, extra, aliases = parts[:5]
        # extra: chiave=valore, il valore può contenere spazi (es. p=panna fresca)
        e = {m.group(1): m.group(2).strip() for m in re.finditer(r'(\w+)=(.*?)(?=\s+\w+=|$)', extra)}
        out.append({'name': name, 'dep': dep, 'src': src, 'extra': e, 'aliases': [a.strip() for a in aliases.split(';') if a.strip()], 'file': os.path.basename(path)})
    return out

files = sys.argv[1:] or sorted(glob.glob('seed/*.txt'))
rows = [r for f in files for r in parse(f)]
res, bad = [], 0
for r in rows:
    src = r['src']; v = None; tag = ''
    if src == 'zero': v = {k: 0.0 for k in NUT}; v.update(en='(nessun valore: 0)', code='zero'); tag = 'zero'
    elif src.startswith('usda:'):
        u = usda.get(src[5:]); v = u and {**u, 'code': src}; tag = 'usda'
    elif src.startswith('q:'):
        for alt in src[2:].split('//'):
            v = search(alt)
            if v: break
        tag = 'q'
    elif src in idx: v = idx[src]; tag = 'c'
    elif src in ('', '-'): v = None; tag = 'none'
    if v is None and tag != 'none': bad += 1
    r['match'] = v and {k: v.get(k) for k in ['code', 'en', 'fr'] + NUT}
    res.append(r)
    show = f"{v['code']} {v['en'][:55]} kcal={v['kcal']}" if v else ('— nessun valore —' if tag == 'none' else f'!!! NON TROVATO ({src})')
    print(f"{r['name'][:32]:32} {tag:4} {show}")
json.dump(res, open('foods-resolved.json', 'w'), ensure_ascii=False)
print(f'\n{len(res)} alimenti, {bad} non trovati')
