# Da foods-resolved.json al file usato dall'app (public/foods.json).
# Uso: python3 tools/build_foods.py OUT.json
import json, sys, re, unicodedata, datetime

def fold(s):
    s = ' '.join(str(s or '').strip().lower().replace('’', "'").replace('`', "'").split())
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', fold(s)).strip('-')

rows = json.load(open('foods-resolved.json'))
NUT = ['kcal', 'prot', 'carb', 'sugar', 'fat', 'sat', 'fiber', 'salt']
byname = {fold(r['name']): slug(r['name']) for r in rows}
foods, aliases, clash = [], {}, []

def add_alias(a, fid, own=False):
    k = fold(a)
    if not k: return
    if k in aliases and aliases[k] != fid:
        if own: aliases[k] = fid  # il nome proprio vince su un nome alternativo
        else: clash.append((a, aliases[k], fid)); return
    else: aliases[k] = fid

for r in rows:
    fid = slug(r['name']); e = r['extra']; m = r['match']
    f = {'id': fid, 'n': r['name'], 'd': r['dep']}
    if e.get('p'):
        pid = byname.get(fold(e['p']))
        if not pid: print('VARIANTE SENZA GENITORE:', r['name'], e['p'])
        else: f['p'] = pid
    if e.get('k'): f['k'] = e['k']
    if e.get('approx'): f['a'] = 1
    if e.get('pz'): f['pz'] = float(e['pz'])
    if e.get('d'): f['den'] = float(e['d'])
    if e.get('u'):
        f['u'] = {k: float(v) for k, v in (x.split(':') for x in e['u'].split(','))}
    if m:
        code = m['code']
        f['src'] = 'zero' if code == 'zero' else (code if str(code).startswith('usda:') else 'ciqual:' + str(code))
        f['v'] = [None if m.get(k) is None else round(float(m[k]), 2) for k in NUT]
    foods.append(f)

for r in rows: add_alias(r['name'], slug(r['name']), own=True)
for r in rows:
    for a in r['aliases']: add_alias(a, slug(r['name']))

out = {
    'version': datetime.date.today().isoformat() + '-' + str(len(foods)),
    'nutrients': NUT,
    'sources': {
        'ciqual': 'ANSES-CIQUAL, Table de composition nutritionnelle des aliments Ciqual 2025 (Licence Ouverte Etalab 2.0)',
        'usda': 'USDA FoodData Central, SR Legacy 2018 (pubblico dominio)',
    },
    'foods': foods,
    'aliases': dict(sorted(aliases.items())),
}
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(foods), 'alimenti,', len(aliases), 'nomi; conflitti:', len(clash))
for c in clash[:30]: print('  conflitto:', c)
