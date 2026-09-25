import re

with open('/home/pi/mimo/firebase_listener.py', 'r') as f:
    content = f.read()

# 1. Add safe_update function
safe_update_code = '''
def safe_update(doc_ref, data):
    import time
    try:
        doc_ref.update(data, timeout=5)
    except Exception as e:
        print(f"⚠️ safe_update retry after error: {e}")
        try:
            # Refresh connection by using a new document reference
            new_ref = db.collection('print_jobs').document(doc_ref.id)
            new_ref.update(data, timeout=10)
        except Exception as e2:
            print(f"❌ safe_update final failure: {e2}")
'''

if 'def safe_update' not in content:
    content = content.replace('def process_job(doc_snapshot):', safe_update_code + '\ndef process_job(doc_snapshot):')

# 2. Replace doc_ref.update with safe_update
content = re.sub(r'doc_ref\.update\((.*?)\)', r'safe_update(doc_ref, \1)', content)

# 3. Fix FieldFilter warnings
filter_import = '''
from google.cloud.firestore_v1.base_query import FieldFilter
'''
if 'FieldFilter' not in content:
    content = content.replace('from firebase_admin import credentials, firestore, storage', 'from firebase_admin import credentials, firestore, storage' + filter_import)

content = content.replace(".where('status', '==', 'printing')", ".where(filter=FieldFilter('status', '==', 'printing'))")
content = content.replace(".where('kioskId', '==', KIOSK_ID)", ".where(filter=FieldFilter('kioskId', '==', KIOSK_ID))")

with open('/home/pi/mimo/firebase_listener.py', 'w') as f:
    f.write(content)
print("Patch applied.")
