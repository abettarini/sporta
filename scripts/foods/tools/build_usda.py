# Indice USDA SR Legacy: fdc_id, descrizione, valori per 100 g (sale = sodio mg × 2,5 / 1000).
import csv, json, sys
D = sys.argv[1]
foods = {r['fdc_id']: r['description'] for r in csv.DictReader(open(D + '/food.csv', encoding='utf-8'))}
IDS = {'1008': 'kcal', '1003': 'prot', '1005': 'carb', '1004': 'fat', '2000': 'sugar', '1079': 'fiber', '1258': 'sat', '1093': 'na'}
vals = {}
for r in csv.DictReader(open(D + '/food_nutrient.csv', encoding='utf-8')):
    k = IDS.get(r['nutrient_id'])
    if k and r['fdc_id'] in foods:
        vals.setdefault(r['fdc_id'], {})[k] = float(r['amount'])
out = {}
for fid, name in foods.items():
    v = vals.get(fid, {})
    out[fid] = {'code': 'usda:' + fid, 'en': name, 'fr': '', 'grp': 'usda', **{k: v.get(k) for k in ['kcal', 'prot', 'carb', 'fat', 'sugar', 'fiber', 'sat']}, 'salt': round(v['na'] * 2.5 / 1000, 3) if 'na' in v else None}
json.dump(out, open('usda-index.json', 'w'), ensure_ascii=False)
print(len(out), 'alimenti USDA')
