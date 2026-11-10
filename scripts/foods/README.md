# Database centrale degli alimenti

`public/foods.json` (usato dall'app e dal server tramite `public/foods-lib.js`) si genera da qui.

- `seed/*.txt` — l'elenco curato a mano, un alimento per riga:
  `Nome | reparto | fonte | extra | nomi alternativi; separati; da punto e virgola`
  - **fonte**: codice CIQUAL (es. `22000`), `usda:<fdc_id>`, `q:<ricerca>` (prima voce CIQUAL che contiene tutte le parole; alternative con `//`) oppure `zero` (acqua, sale da cucina conta 0 kcal, aromi…).
  - **extra**: `pz=` peso medio di un pezzo in g, `d=` densità (g/ml), `u=unità:g,…` (es. `u=spicchi:5`), `k=` tipo (`carne`, `pesce`, `latte`, `uova`, `miele`; vuoto = vegetale), `p=` variante di (nome dell'alimento generico), `approx=1` valori presi da un alimento simile.
- `tools/` — script Python (solo libreria standard + openpyxl) e un controllo di copertura in Node.

## Rigenerare

```bash
mkdir -p raw && cd raw
# CIQUAL 2025 (ANSES, Licence Ouverte Etalab 2.0): https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY
#   salvare come raw/ciqual2025.xlsx e raw/alim.xml
# USDA FoodData Central SR Legacy (pubblico dominio): https://fdc.nal.usda.gov/download-datasets
#   FoodData_Central_sr_legacy_food_csv_2018-04.zip, estratto in usda/
cd ..
python3 tools/build_index.py raw            # -> ciqual-index.json
python3 tools/build_usda.py usda/FoodData_Central_sr_legacy_food_csv_2018-04   # -> usda-index.json
python3 tools/resolve.py                    # abbina le fonti e stampa la revisione (-> foods-resolved.json)
python3 tools/build_foods.py ../../public/foods.json
node tools/coverage.js /percorso/ricette.json   # copertura su un file di ricette (formato di "Importa ricette")
```

Strumenti per la revisione: `tools/find.py "parole"` cerca in CIQUAL (`… 6 usda-index.json` in USDA), `tools/fix.py seed/file.txt "Nome=fonte"` cambia la fonte (con ` ~` = stimato), `tools/alias.py "Nome=alias1;alias2"` aggiunge nomi alternativi.

I valori sono per 100 g di alimento crudo/così com'è: kcal (regolamento UE 1169/2011), proteine, carboidrati, zuccheri, grassi, saturi, fibre, sale. Nell'app vanno citate le fonti (lo fa il riquadro dei valori nelle ricette).
