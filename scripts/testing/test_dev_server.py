import urllib.request

req = urllib.request.Request('http://localhost:5174/', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    print('HTTP Status:', resp.status)
    print('Content-Type:', resp.headers.get('Content-Type'))
    content = resp.read().decode('utf-8')
    print('HTML Content Length:', len(content))
    print('Contains root element:', '<div id="root">' in content)
