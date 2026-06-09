import firebase_admin
from firebase_admin import credentials, firestore
import uuid

# Initialize Firebase exactly like the listener does
cred = credentials.Certificate("mimo-firebase-adminsdk.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

print("🚀 Injecting a live unified 4-per-page print job into Firestore for Kiosk 1...")

# We will use dummy images from Firebase Storage or any public URL
# It's better to use an actual image URL so CUPS doesn't fail parsing.
# The user already uploaded images to the bucket, but we can just use a placeholder image.
dummy_url = "https://picsum.photos/800/1200"

files = [
    {"name": "test_image_1.jpg", "url": "https://picsum.photos/id/10/800/1200", "type": "image/jpeg", "pageCount": 1},
    {"name": "test_image_2.jpg", "url": "https://picsum.photos/id/20/800/1200", "type": "image/jpeg", "pageCount": 1},
    {"name": "test_image_3.jpg", "url": "https://picsum.photos/id/30/800/1200", "type": "image/jpeg", "pageCount": 1},
    {"name": "test_image_4.jpg", "url": "https://picsum.photos/id/40/800/1200", "type": "image/jpeg", "pageCount": 1}
]

doc_ref = db.collection("print_jobs").document()
doc_ref.set({
    "userId": "system_test_user",
    "fileName": "4_Images_Unified",
    "fileUrl": files[0]["url"], # legacy support
    "mimetype": "image/jpeg",
    "files": files,
    "status": "printing",       # Instantly triggers the listener
    "kioskId": "MIMO-001",      # Instantly triggers Kiosk 1 listener
    "pageCount": 4,
    "printOptions": {
        "photoLayout": "4",
        "colorMode": "bw",
        "copies": 1
    },
    "createdAt": firestore.SERVER_TIMESTAMP,
    "updatedAt": firestore.SERVER_TIMESTAMP
})

print(f"✅ Live job {doc_ref.id} injected successfully!")
print("The Raspberry Pi should pick it up within 1 second and physically print the combined sheet.")
