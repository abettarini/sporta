# Uso: python3 find.py "parola1 parola2" [n]  -> candidati CIQUAL (cerca nei nomi EN e FR)
import json, sys, re
idx = json.load(open(sys.argv[3] if len(sys.argv) > 3 else 'ciqual-index.json'))
q = sys.argv[1].lower().split(); n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
res = []
for v in idx.values():
    t = (v['en'] + ' | ' + v['fr']).lower()
    if all(w in t for w in q):
        res.append((len(v['en']), v))
for _, v in sorted(res, key=lambda x: x[0])[:n]:
    print(f"{v['code']:>6} {v['grp']:>4} {v['en'][:70]:70} kcal={v['kcal']}")
