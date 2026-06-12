import firebase_admin
from firebase_admin import credentials, firestore
try:
    cred = credentials.Certificate('pi_scripts/serviceAccountKey.json')
    firebase_admin.initialize_app(cred)
except Exception as e:
    print(e)
db = firestore.client()
users = db.collection('users').where('email', '==', 'hpsnowjug@gmail.com').get()
for u in users:
    print(u.id, u.to_dict())
