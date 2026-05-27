import firebase_admin
from firebase_admin import credentials, firestore, storage
import time
import subprocess
import os
import requests
import urllib.parse
from datetime import datetime, timedelta
import threading

# ================= CONFIGURATION =================
PRINTER_NAME = os.environ.get("PRINTER_NAME", "Brother_HL_L5210DN_series")
TEMP_DIR = "/tmp/mimo_prints"

if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# Initialize Firebase (Requires serviceAccountKey.json on the Pi)
try:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred, {
        'storageBucket': 'mimo-v2-11868.firebasestorage.app'
    })
    db = firestore.client()
    bucket = storage.bucket()
    print("✅ Successfully connected to Firebase!")
except Exception as e:
    print(f"❌ Failed to initialize Firebase: {e}")
    exit(1)

def convert_to_pdf(input_path):
    """ Converts docx, pptx, xlsx to PDF using local LibreOffice """
    try:
        print(f"⏳ Converting {input_path} to PDF via LibreOffice...")
        subprocess.run([
            "libreoffice", "--headless", "--convert-to", "pdf",
            "--outdir", TEMP_DIR, input_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        pdf_path = os.path.splitext(input_path)[0] + ".pdf"
        if os.path.exists(pdf_path):
            print(f"✅ Conversion successful: {pdf_path}")
            return pdf_path
        else:
            raise Exception("PDF file not found after conversion")
    except subprocess.CalledProcessError as e:
        print(f"❌ Conversion failed: {e}")
        return None

def print_file(file_path, copies=1):
    """ Sends file to CUPS printer """
    try:
        print(f"🖨️  Sending to CUPS: {file_path} ({copies} copies)")
        cmd = ["lp", "-d", PRINTER_NAME, "-n", str(copies), file_path]
        subprocess.run(cmd, check=True)
        print("✅ Print job submitted successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Print failed: {e}")
        return False

def download_file(file_url, file_name):
    """ Downloads file from Firebase Storage to local temp directory """
    try:
        # Generate safe file name
        safe_name = "".join([c for c in file_name if c.isalpha() or c.isdigit() or c in ' ._-']).rstrip()
        local_path = os.path.join(TEMP_DIR, f"{int(time.time())}_{safe_name}")
        
        print(f"⬇️  Downloading from Firebase Storage...")
        
        # Extract the storage path from the URL
        if "firebasestorage.googleapis.com" in file_url:
            path = file_url.split("/o/")[1].split("?")[0]
            blob_path = urllib.parse.unquote(path)
        else:
            blob_path = file_url.split(bucket.name + "/")[1]
            
        blob = bucket.blob(blob_path)
        blob.download_to_filename(local_path)
        
        print(f"✅ Downloaded to: {local_path}")
        return local_path
    except Exception as e:
        print(f"❌ Download failed: {e}")
        return None

def process_job(doc_snapshot):
    """ Processes a single print job """
    doc = doc_snapshot.to_dict()
    doc_id = doc_snapshot.id
    doc_ref = db.collection('print_jobs').document(doc_id)
    
    file_url = doc.get("fileUrl")
    file_name = doc.get("fileName", "document.pdf")
    copies = doc.get("copies", 1)
    
    # 1. Download
    local_path = download_file(file_url, file_name)
    if not local_path:
        doc_ref.update({"status": "failed", "printerStatus": "Failed to download on Pi"})
        return

    final_path = local_path

    # 2. Convert if needed
    ext = os.path.splitext(local_path)[1].lower()
    if ext in [".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls"]:
        pdf_path = convert_to_pdf(local_path)
        if pdf_path:
            final_path = pdf_path
        else:
            doc_ref.update({"status": "failed", "printerStatus": "LibreOffice conversion failed on Pi"})
            return

    # 3. Print
    success = print_file(final_path, copies)
    
    # 4. Update Status
    if success:
        doc_ref.update({
            "status": "completed", 
            "isPrinted": True, 
            "printerStatus": "Printed",
            "printedAt": firestore.SERVER_TIMESTAMP
        })
        print(f"🎉 Job {doc_id} marked as completed in database.")
    else:
        doc_ref.update({"status": "failed", "printerStatus": "CUPS error on Pi"})

    # Cleanup
    try:
        os.remove(local_path)
        if final_path != local_path:
            os.remove(final_path)
    except:
        pass

def on_snapshot(col_snapshot, changes, read_time):
    """ Callback triggered whenever Firestore changes """
    for change in changes:
        if change.type.name == 'ADDED' or change.type.name == 'MODIFIED':
            doc = change.document
            data = doc.to_dict()
            
            # Check for ghost printing (expire jobs older than 15 mins)
            # This prevents 20 jobs printing at once if Pi loses internet for hours
            updated_at = data.get("updatedAt")
            if updated_at:
                now = datetime.now(updated_at.tzinfo)
                if (now - updated_at) > timedelta(minutes=15):
                    print(f"⚠️ Skipping job {doc.id} - older than 15 minutes (ghost print prevention)")
                    db.collection('print_jobs').document(doc.id).update({"status": "failed", "printerStatus": "Job expired while Pi was offline"})
                    continue
            
            # If valid, process it!
            if data.get("status") == "printing" and not data.get("isPrinted", False):
                print(f"\n🔔 New job detected: {doc.id}")
                process_job(doc)

# ================= START LISTENER =================
print("\n📡 Pi Listener Started. Waiting for jobs (status: 'printing')...")

def heartbeat_loop():
    """ Sends printer status to Firestore every 30 seconds """
    while True:
        try:
            status = "Online"
            try:
                # Query CUPS for printer status
                result = subprocess.run(["lpstat", "-p", PRINTER_NAME], capture_output=True, text=True)
                output = result.stdout.lower()
                if "disabled" in output or "paused" in output:
                    status = "Paused / Error"
                elif "idle" in output:
                    status = "Idle"
                elif "printing" in output:
                    status = "Printing"
                else:
                    status = "Unknown State"
            except:
                status = "lpstat failed"
                
            db.collection("system_status").document("pi").set({
                "lastSeen": firestore.SERVER_TIMESTAMP,
                "printerStatus": status
            }, merge=True)
        except Exception as e:
            print(f"⚠️ Heartbeat failed: {e}")
            
        time.sleep(30)

# Start heartbeat in a background thread
threading.Thread(target=heartbeat_loop, daemon=True).start()

# Watch the print_jobs collection where status == 'printing'
query = db.collection('print_jobs').where('status', '==', 'printing')
query_watch = query.on_snapshot(on_snapshot)

# Keep the main thread alive
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n🛑 Shutting down listener.")
