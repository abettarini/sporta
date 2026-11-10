# Aggiunge gli allergeni di seed/allergeni.txt a public/foods.json (campo `al`, e `nl` = senza lattosio).
# Uso: python3 tools/allergens.py ../../public/foods.json   (dopo build_foods.py)
import json, sys, re, hashlib

ALLERGENS = ['glutine', 'crostacei', 'uova', 'pesce', 'arachidi', 'soia', 'latte', 'frutta-guscio',
             'sedano', 'senape', 'sesamo', 'solfiti', 'lupini', 'molluschi']
path = sys.argv[1]
data = json.load(open(path))
byid = {f['id']: f for f in data['foods']}

own, none, nolact, unknown = {}, set(), set(), []
text = re.sub(r'#.*', '', open('seed/allergeni.txt').read())
for m in re.finditer(r'^([a-z-]+):((?:.|\n[ \t]+)*)', text, re.M):
    tag, ids = m.group(1), [x.strip() for x in m.group(2).replace('\n', ' ').split(',') if x.strip()]
    for i in ids:
        if i not in byid: unknown.append((tag, i)); continue
        if tag == 'nessuno': none.add(i)
        elif tag == 'senza-lattosio': nolact.add(i)
        elif tag in ALLERGENS: own.setdefault(i, set()).add(tag)
        else: unknown.append((tag, i))

def own_set(f):
    s = set(own.get(f['id'], set()))
    if f.get('k') == 'latte': s.add('latte')
    if f.get('k') == 'uova': s.add('uova')
    if f.get('k') == 'pesce' and not s & {'crostacei', 'molluschi'}: s.add('pesce')
    return s

def resolve(f, seen=()):
    s = own_set(f)
    if f['id'] in none or f['id'] in own: return s
    p = byid.get(f.get('p'))
    if p and p['id'] not in seen: s |= resolve(p, seen + (f['id'],))
    return s

for f in data['foods']:
    f.pop('al', None); f.pop('nl', None)
    s = resolve(f)
    if s: f['al'] = [a for a in ALLERGENS if a in s]
    if f['id'] in nolact: f['nl'] = 1
data['allergens'] = ALLERGENS
# la versione cambia con il contenuto: le app riscaricano il database
digest = hashlib.sha1(json.dumps([data['foods'], data['aliases']], sort_keys=True).encode()).hexdigest()[:6]
data['version'] = re.sub(r'-[0-9a-f]{6}$', '', data['version']) + '-' + digest
json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
n = sum(1 for f in data['foods'] if f.get('al'))
print(n, 'alimenti con allergeni;', len(nolact), 'senza lattosio')
for u in unknown: print('  sconosciuto:', u)
