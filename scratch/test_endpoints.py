import urllib.request, json

urls = [
    'http://localhost:3000/api/flood-forecast',
    'http://localhost:3000/api/drought',
    'http://localhost:3000/api/districts',
    'http://localhost:3000/api/hazards',
    'http://localhost:3000/api/glacial-lakes'
]

for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
            print(f'{url}: SUCCESS, features: {len(data.get("features", []))}')
    except Exception as e:
        print(f'{url}: FAILED: {e}')
