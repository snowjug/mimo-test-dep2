import firebase_admin
from firebase_admin import credentials, firestore

try:
    cred = credentials.Certificate("/home/pi/mimo/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    docs = db.collection("print_jobs").order_by("updatedAt", direction=firestore.Query.DESCENDING).limit(5).stream()
    for d in docs:
        data = d.to_dict()
        print(f"[{d.id}] Status: {data.get('status')} | Kiosk: {data.get('kioskId')} | Code: {data.get('printCode')} | Type: {data.get('colorMode')} | File: {data.get('fileName')}")
except Exception as e:
    print(f"Error: {e}")
