"""Refresh EA's published ratings and ESPN jersey numbers (Python standard library).
Use --cache DIR to reuse fetched pages. Data is only replaced after validation.
"""
import argparse, concurrent.futures, datetime, hashlib, json, math, re, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
a = argparse.ArgumentParser(); a.add_argument('--cache', type=Path); opts = a.parse_args()
cache = opts.cache
if cache: cache.mkdir(parents=True, exist_ok=True)
def fetch(url, key):
    path = cache / (key + '.html') if cache else None
    if path and path.exists(): return path.read_text()
    last = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=25) as response: text = response.read().decode('utf-8')
            if path: path.write_text(text)
            return text
        except Exception as error: last = error
    raise last

def ea_page(page):
    url = 'https://www.ea.com/games/nhl/ratings' + (f'?page={page}' if page > 1 else '')
    text = fetch(url, f'ea-{page}')
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
    if not m: raise ValueError('EA embedded ratings missing')
    p = json.loads(m[1])['props']['pageProps']['ratingDetails']
    return url, p
url, first = ea_page(1)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    pages = [(url, first)] + list(pool.map(ea_page, range(2, math.ceil(first['totalItems']/50)+1)))
items = {p['id']: (p,u) for u,d in pages for p in d['items']}
if len(items) != first['totalItems']: raise ValueError(f"Incomplete EA pagination: {len(items)} of {first['totalItems']}")
# ESPN's own team selector supplies all roster URLs and team abbreviations.
seed = fetch('https://www.espn.com/nhl/team/roster/_/name/edm/edmonton-oilers', 'espn-edm')
urls = sorted(set(re.findall(r'"url":"(/nhl/team/roster/_/name/[^" ]+)"', seed)) | {'/nhl/team/roster/_/name/edm/edmonton-oilers'})
if len(urls) != 32: raise ValueError(f'Expected 32 ESPN teams, got {len(urls)}')
alias = {'LA':'LAK', 'SJ':'SJS', 'TB':'TBL', 'UTAH':'UTA', 'UT':'UTA', 'NJ':'NJD', 'MON':'MTL', 'WSH':'WSH'}
def espn_page(path):
    ab = path.split('/name/')[1].split('/')[0]
    url = 'https://www.espn.com' + path
    text = fetch(url, 'espn-' + ab)
    players = {}
    decoder = json.JSONDecoder()
    for match in re.finditer(r'\{"shortName":', text):
        try: p,_ = decoder.raw_decode(text[match.start():])
        except ValueError: continue
        if not p.get('name') or not str(p.get('jersey','')).isdigit(): continue
        n=int(p['jersey'])
        if not 1<=n<=98: continue
        players[p['id']]={'name':p['name'],'number':n,'birthDate':p.get('birthDate'),'source':url,'playerUrl':p.get('href')}
    if not players: raise ValueError('No ESPN numbers found for '+ab)
    return alias.get(ab.upper(),ab.upper()),list(players.values())
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    teams=dict(pool.map(espn_page,urls))
# Keep every published nonzero attribute, including goalie-only and extra EA fields.
ratings=[]
for p,u in items.values():
    stats={k:v['value'] for k,v in p['stats'].items() if isinstance(v.get('value'),int) and 0<v['value']<=99}
    if not stats or not 40<=p['overallRating']<=99: raise ValueError('Invalid EA ratings')
    ratings.append({'id':p['id'],'name':p['firstName']+' '+p['lastName'],'team':p['team']['label'],'pos':p['position']['shortLabel'],'ovr':p['overallRating'],'number':p.get('jerseyNum'),'stats':stats,'abilities':[q['label'] for q in p.get('playerAbilities',[])],'source':u})
data={'retrieved':datetime.date.today().isoformat(),'edition':'NHL 27','eaTotal':first['totalItems'],'ratings':ratings,'numbers':teams}
dest=ROOT/'src/data/verifiedPlayerData.json';temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temp.replace(dest)
print(f"Saved {len(ratings)} full EA ratings and {sum(len(p) for p in teams.values())} ESPN jersey numbers across {len(teams)} clubs.")
