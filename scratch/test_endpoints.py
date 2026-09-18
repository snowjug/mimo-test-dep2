import urllib.request
import json
import re

print("=== 1. TEST FETCHING VERCEL ASSETS ===")
try:
    req = urllib.request.Request("https://mimo-2-0.vercel.app/assets/index-Bx4i2OGn.js", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode('utf-8')
        print("JS Bundle Length:", len(content))
        print("First 200 chars:", content[:200])
except Exception as e:
    print("JS Fetch Error:", e)

try:
    req = urllib.request.Request("https://mimo-2-0.vercel.app/assets/index-Clm1jLXo.css", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode('utf-8')
        print("CSS Bundle Length:", len(content))
except Exception as e:
    print("CSS Fetch Error:", e)

print("\n=== 2. TEST SCREENSAVER FIRESTORE & API ENDPOINTS ===")
try:
    req = urllib.request.Request("https://firestore.googleapis.com/v1/projects/mimo-v2-11868/databases/(default)/documents/mimo_settings/screensaver", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        print("Screensaver Firestore Status:", resp.status)
        print("Screensaver Body:", resp.read().decode('utf-8'))
except Exception as e:
    print("Firestore screensaver error:", e)

try:
    req = urllib.request.Request("https://api-upqxuj7evq-uc.a.run.app/api/screensaver", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        print("Backend screensaver status:", resp.status)
        print("Backend screensaver body:", resp.read().decode('utf-8'))
except Exception as e:
    print("Backend screensaver error:", e)
