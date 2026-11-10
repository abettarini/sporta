# Indice CIQUAL 2025: codice, nomi FR/EN, gruppo, valori per 100 g (kcal UE, proteine, carboidrati, zuccheri, grassi, saturi, fibre, sale).
import openpyxl, re, json, sys
RAW = sys.argv[1]
names = {}
x = open(RAW + '/alim.xml', encoding='utf-8-sig').read()
for m in re.finditer(r'<alim_code>\s*(\d+)\s*</alim_code>\s*<alim_nom_fr>\s*(.*?)\s*</alim_nom_fr>\s*<alim_nom_eng>\s*(.*?)\s*</alim_nom_eng>', x, re.S):
    names[m.group(1)] = (m.group(2), m.group(3))
COLS = {'kcal': 10, 'prot': 14, 'carb': 16, 'fat': 17, 'sugar': 18, 'fiber': 26, 'sat': 31, 'salt': 49}
def num(v):
    if v is None: return None
    s = str(v).strip().replace(',', '.')
    if s in ('-', ''): return None
    if s.lower() == 'traces': return 0.0
    if s.startswith('<'): return 0.0
    try: return float(s)
    except ValueError: return None
wb = openpyxl.load_workbook(RAW + '/ciqual2025.xlsx', read_only=True)
rows = wb[wb.sheetnames[0]].iter_rows(values_only=True)
next(rows)
out = {}
for r in rows:
    code = str(r[6]).strip()
    fr, en = names.get(code, (r[7], ''))
    out[code] = {'code': code, 'fr': fr, 'en': en, 'grp': str(r[1] or ''), 'ssgrp': str(r[2] or ''), 'sub': r[5] or '', **{k: num(r[i]) for k, i in COLS.items()}}
json.dump(out, open('ciqual-index.json', 'w'), ensure_ascii=False)
print(len(out), 'alimenti; senza kcal:', sum(1 for v in out.values() if v['kcal'] is None))
