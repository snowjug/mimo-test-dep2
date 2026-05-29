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
# Kiosk Routing Identity
KIOSK_ID = os.environ.get("KIOSK_ID", "KIOSK_1")
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
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        
        pdf_path = os.path.splitext(input_path)[0] + ".pdf"
        if os.path.exists(pdf_path):
            print(f"✅ Conversion successful: {pdf_path}")
            return pdf_path
        else:
            raise Exception("PDF file not found after conversion")
    except subprocess.CalledProcessError as e:
        print(f"❌ Conversion failed: {e}")
        return None

def print_file(file_path, copies=1, page_range=None):
    """ Sends file to CUPS printer and verifies it printed successfully """
    try:
        # Validate file exists and has real content
        file_size = os.path.getsize(file_path)
        if file_size < 100:
            print(f"❌ File too small ({file_size} bytes) - likely invalid/empty")
            return False

        # For PDFs, do a basic header check
        if file_path.endswith('.pdf'):
            with open(file_path, 'rb') as f:
                header = f.read(8)
            if not header.startswith(b'%PDF'):
                print(f"❌ File does not appear to be a valid PDF (header: {header})")
                return False
            print(f"✅ Valid PDF confirmed ({file_size} bytes)")

        print(f"🖨️  Sending to CUPS: {file_path} ({copies} copies, pages: {page_range or 'all'})")
        cmd = ["lp", "-d", PRINTER_NAME, "-n", str(copies)]
        if page_range:
            cmd.extend(["-P", str(page_range)])
        cmd.append(file_path)
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=15)
        
        # Extract job ID from lp output (e.g., "request id is Brother_HL_L5210DN_series-3372 (1 file(s))")
        lp_output = result.stdout.strip()
        print(f"CUPS: {lp_output}")
        
        # Wait a moment and check if the job completed without errors
        time.sleep(2)
        
        # Extract job number from output
        import re
        match = re.search(r'is (\S+-\d+)', lp_output)
        if match:
            job_id = match.group(1)
            status_result = subprocess.run(
                ["lpstat", "-l", job_id],
                capture_output=True, text=True, timeout=10
            )
            status_output = status_result.stdout
            print(f"Job status: {status_output.strip()[:200]}")
            
            if "job-completed-with-errors" in status_output or "loadFilename failed" in status_output:
                print(f"❌ CUPS rendered the job with errors - PDF may be malformed")
                return False

        print("✅ Print job submitted and verified successfully!")
        return True
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.strip() if e.stderr else str(e)
        print(f"❌ Print failed: {stderr}")
        return False
    except Exception as e:
        print(f"❌ Unexpected print error: {e}")
        return False


def download_file(file_url, file_name):
    """ Downloads file from Firebase Storage to local temp directory """
    try:
        # Generate safe file name
        safe_name = "".join([c for c in file_name if c.isalpha() or c.isdigit() or c in ' ._-']).rstrip()
        local_path = os.path.join(TEMP_DIR, f"{int(time.time())}_{safe_name}")
        
        print(f"⬇️  Downloading from Firebase Storage...")
        
        blob_path = None

        # Strategy 1: gs:// URL
        if file_url.startswith("gs://"):
            blob_path = file_url.split(bucket.name + "/")[1]

        # Strategy 2: Standard Firebase Storage URL (contains /o/)
        elif "firebasestorage.googleapis.com" in file_url and "/o/" in file_url:
            path = file_url.split("/o/")[1].split("?")[0]
            blob_path = urllib.parse.unquote(path)

        # Strategy 2.5: Google Cloud Storage REST URL
        elif "storage.googleapis.com/" in file_url:
            # Example: https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/uploads/file.pdf
            # Split by bucket name to get the path
            if f"/{bucket.name}/" in file_url:
                path = file_url.split(f"/{bucket.name}/")[1].split("?")[0]
                blob_path = urllib.parse.unquote(path)

        if blob_path:
            # Use Firebase Admin SDK to download directly
            blob = bucket.blob(blob_path)
            blob.download_to_filename(local_path)
        else:
            # Strategy 3: Fallback - direct HTTP download (handles signed URLs, etc.)
            print(f"⬇️  Using direct HTTP download for URL type...")
            import requests as req_lib
            response = req_lib.get(file_url, stream=True, timeout=30)
            response.raise_for_status()
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        
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
    
    # Extract page range configuration
    print_options = doc.get("printOptions", {})
    page_selection = print_options.get("pageSelection") or print_options.get("pagesToPrint") or "all"
    page_range = None
    if page_selection == "custom":
        page_range = print_options.get("pageRange") or print_options.get("customPageRange")
    
    local_path = None
    final_path = None

    try:
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
        success = print_file(final_path, copies, page_range)
        
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
            
    except Exception as e:
        print(f"❌ Unexpected error processing job: {e}")
        doc_ref.update({"status": "failed", "printerStatus": f"Pi processing error: {str(e)[:50]}"})

    finally:
        # 5. Cleanup
        try:
            if local_path and os.path.exists(local_path):
                os.remove(local_path)
            if final_path and final_path != local_path and os.path.exists(final_path):
                os.remove(final_path)
        except Exception as e:
            print(f"⚠️ Failed to cleanup temporary files: {e}")

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
                threading.Thread(target=process_job, args=(doc,), daemon=True).start()

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
                
            db.collection("system_status").document(KIOSK_ID).set({
                "lastSeen": firestore.SERVER_TIMESTAMP,
                "printerStatus": status
            }, merge=True)
        except Exception as e:
            print(f"⚠️ Heartbeat failed: {e}")
            
        time.sleep(30)

# Start heartbeat in a background thread
threading.Thread(target=heartbeat_loop, daemon=True).start()

def watchdog_loop():
    """ Monitors CUPS for stuck jobs or disabled printers and auto-heals them """
    stuck_cycles = 0
    while True:
        try:
            # 1. Always ensure printer is enabled (CUPS auto-disables on communication errors)
            subprocess.run(["sudo", "cupsenable", PRINTER_NAME], capture_output=True)
            
            # 2. Check for stuck jobs
            result = subprocess.run(["lpstat", "-W", "not-completed"], capture_output=True, text=True)
            if PRINTER_NAME in result.stdout:
                stuck_cycles += 1
                print(f"⚠️ Watchdog: Stuck job detected (Cycle {stuck_cycles})")
                
                # If stuck for 2 cycles (~120s), kick the USB daemon to wake up deep sleep
                if stuck_cycles >= 2:
                    print("🔧 Watchdog: Kicking ipp-usb to wake up sleeping printer...")
                    subprocess.run(["sudo", "systemctl", "restart", "ipp-usb"], capture_output=True)
                    subprocess.run(["sudo", "cupsenable", PRINTER_NAME], capture_output=True)
                    stuck_cycles = 0 # reset after kicking
            else:
                stuck_cycles = 0
        except Exception as e:
            print(f"⚠️ Watchdog failed: {e}")
            
        time.sleep(60)

# Start auto-heal watchdog
threading.Thread(target=watchdog_loop, daemon=True).start()

def keep_warm_loop():
    """ Pings the Firebase API every 10 minutes to prevent cold starts """
    while True:
        try:
            requests.get("https://api-upqxuj7evq-uc.a.run.app/", timeout=10)
        except:
            pass
        time.sleep(600) # 10 minutes

# Start keep warm in a background thread
threading.Thread(target=keep_warm_loop, daemon=True).start()

print(f"📡 Pi Listener Started. Identity: {KIOSK_ID}")
print(f"📡 Waiting for jobs (status: 'printing', kioskId: '{KIOSK_ID}')...")

# Watch the print_jobs collection where status == 'printing' AND kioskId matches
query = db.collection('print_jobs').where('status', '==', 'printing').where('kioskId', '==', KIOSK_ID)
query_watch = query.on_snapshot(on_snapshot)

# Keep the main thread alive
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n🛑 Shutting down listener.")
