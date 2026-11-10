# Uso: python3 tools/alias.py "Nome=alias1;alias2" …  aggiunge nomi alternativi all'alimento (in qualunque file)
import sys, glob
add = {}
for a in sys.argv[1:]:
    n, _, v = a.partition('='); add[n.strip()] = [x.strip() for x in v.split(';') if x.strip()]
done = set()
for p in sorted(glob.glob('seed/*.txt')):
    out = []
    for line in open(p, encoding='utf-8'):
        parts = line.rstrip('\n').split('|')
        if len(parts) == 5 and not line.startswith('#') and parts[0].strip() in add:
            n = parts[0].strip(); cur = [x.strip() for x in parts[4].split(';') if x.strip()]
            cur += [x for x in add[n] if x not in cur]
            parts[4] = ' ' + '; '.join(cur); done.add(n)
            line = '|'.join(parts) + '\n'
        out.append(line)
    open(p, 'w', encoding='utf-8').write(''.join(out))
miss = set(add) - done
print('aggiornati', len(done), ('| NON TROVATI: ' + ', '.join(miss)) if miss else '')
