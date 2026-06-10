import firebase_admin
from firebase_admin import credentials, firestore
import uuid
import sys

cred = credentials.Certificate("../serviceAccountKey.json")
try:
    firebase_admin.initialize_app(cred)
except ValueError:
    pass # Already initialized
db = firestore.client()

kiosk_id = sys.argv[1] if len(sys.argv) > 1 else "CV-001"
color_mode = sys.argv[2] if len(sys.argv) > 2 else "bw"

print(f"🚀 Injecting a live unified 4-per-page print job for {kiosk_id} ({color_mode})...")

files = [
    {"name": "test_1.jpg", "url": "https://raw.githubusercontent.com/madhans7/mimo-test-dep2/main/mimo-website/public/images/logo.png", "type": "image/png", "pageCount": 1},
    {"name": "test_2.jpg", "url": "https://raw.githubusercontent.com/madhans7/mimo-test-dep2/main/mimo-website/public/images/logo.png", "type": "image/png", "pageCount": 1},
    {"name": "test_3.jpg", "url": "https://raw.githubusercontent.com/madhans7/mimo-test-dep2/main/mimo-website/public/images/logo.png", "type": "image/png", "pageCount": 1},
    {"name": "test_4.jpg", "url": "https://raw.githubusercontent.com/madhans7/mimo-test-dep2/main/mimo-website/public/images/logo.png", "type": "image/png", "pageCount": 1}
]

doc_ref = db.collection("print_jobs").document()
doc_ref.set({
    "userId": "system_test_user",
    "fileName": f"4_Images_Unified_{kiosk_id}_{color_mode}",
    "fileUrl": files[0]["url"],
    "mimetype": "image/png",
    "files": files,
    "status": "printing",
    "kioskId": kiosk_id,
    "pageCount": 4,
    "colorMode": color_mode,
    "printOptions": {
        "photoLayout": "4",
        "colorMode": color_mode,
        "copies": 1
    },
    "createdAt": firestore.SERVER_TIMESTAMP,
    "updatedAt": firestore.SERVER_TIMESTAMP
})

print(f"✅ Live job {doc_ref.id} injected successfully!")

