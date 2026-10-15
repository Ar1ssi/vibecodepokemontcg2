import json, urllib.request, urllib.parse, os, sys, re

OUT = sys.argv[1]
CORPUS = sys.argv[2]
SYM = {'G': 'Grass', 'R': 'Fire', 'W': 'Water', 'L': 'Lightning', 'P': 'Psychic', 'F': 'Fighting',
       'D': 'Darkness', 'M': 'Metal', 'C': 'Colorless', 'Y': 'Fairy', 'N': 'Dragon'}

rows = json.load(open(CORPUS))
names = {}
for r in rows:
    names.setdefault(r['name'], r)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'se-token-design'})
    with urllib.request.urlopen(req, timeout=20) as f:
        return f.read()


def query(q):
    try:
        return json.loads(get('https://api.tcgdex.net/v2/en/cards?' + urllib.parse.urlencode(q)))
    except Exception as e:
        return []


result = {}
for name, row in names.items():
    full = re.sub(r'\{(\w)\}', lambda m: SYM[m.group(1)], name)
    full = full.replace('Team Rocket’s', "Team Rocket's")
    hits = query({'name': 'eq:' + full}) or query({'name': 'eq:' + name}) or query({'name': full})
    hits = [h for h in hits if h.get('image')]
    if not hits:
        print('MISS', name)
        result[name] = None
        continue
    num = row['number'].lstrip('0')
    pick = next((h for h in hits if h['localId'].lstrip('0') == num), hits[-1])
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    path = os.path.join(OUT, slug + '.png')
    if not os.path.exists(path):
        try:
            open(path, 'wb').write(get(pick['image'] + '/high.png'))
        except Exception as e:
            print('IMGFAIL', name, e)
            continue
    result[name] = {'id': pick['id'], 'slug': slug, 'tcgdexName': pick['name'], 'text': row['text'],
                    'set': row['set']}
    print('OK', name, pick['id'])
json.dump(result, open(os.path.join(OUT, 'index.json'), 'w'), indent=1, ensure_ascii=False)
