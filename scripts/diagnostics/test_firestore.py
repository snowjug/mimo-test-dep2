import firebase_admin
from firebase_admin import credentials, firestore
import json

if not firebase_admin._apps:
    cred = credentials.Certificate('backend/api/mimo-v2-firebase-adminsdk-j33p2-c2eebff503.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()
docs = db.collection('print_jobs').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(1).stream()
for doc in docs:
    data = doc.to_dict()
    print("STATUS:", data.get("status"))
    print("PRINTER STATUS:", data.get("printerStatus"))
