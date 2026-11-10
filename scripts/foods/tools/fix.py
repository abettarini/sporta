# Uso: python3 tools/fix.py seed/file.txt "Nome=fonte" "Nome=fonte ~" …   (~ = valore stimato da alimento simile)
import sys
p = sys.argv[1]; fix = {}
for a in sys.argv[2:]:
    n, _, v = a.partition('='); fix[n.strip()] = v.strip()
out = []; seen = set()
for line in open(p, encoding='utf-8'):
    parts = line.rstrip('\n').split('|')
    if len(parts) >= 4 and not line.startswith('#'):
        n = parts[0].strip()
        if n in fix:
            src, _, approx = fix[n].partition(' ')
            parts[2] = f' {src} '
            if approx and 'approx=1' not in parts[3]: parts[3] = parts[3].rstrip() + ' approx=1 '
            seen.add(n)
    out.append('|'.join(parts))
open(p, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
miss = set(fix) - seen
print('corretti', len(seen), ('| NON TROVATI: ' + ', '.join(miss)) if miss else '')
