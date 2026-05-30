import firebase_admin
from firebase_admin import credentials, firestore, storage
import time
import subprocess
import os
import urllib.parse
from datetime import datetime, timedelta
import threading
import requests

# ================= CONFIGURATION =================
BW_PRINTER_NAME = os.environ.get("BW_PRINTER_NAME", "Brother_HL_L2440DW_series")
COLOR_PRINTER_NAME = os.environ.get("COLOR_PRINTER_NAME", "Epson_L3250")
# Kiosk Routing Identity
KIOSK_ID = os.environ.get("KIOSK_ID", "KIOSK_1")
TEMP_DIR = "/tmp/mimo_prints"

if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# Initialize Firebase
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

def process_image_fill(input_path):
    try:
        from PIL import Image
        print(f"⏳ Processing image for FILL/CROP to A4: {input_path}")
        
        with Image.open(input_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            original_w, original_h = img.size
            if original_w > original_h:
                target_ratio = 1.414  # landscape
            else:
                target_ratio = 1 / 1.414  # portrait
                
            current_ratio = original_w / original_h
            
            if current_ratio > target_ratio + 0.01:
                new_w = int(original_h * target_ratio)
                left = (original_w - new_w) / 2
                img = img.crop((left, 0, left + new_w, original_h))
            elif current_ratio < target_ratio - 0.01:
                new_h = int(original_w / target_ratio)
                top = (original_h - new_h) / 2
                img = img.crop((0, top, original_w, top + new_h))
                
            pdf_path = os.path.splitext(input_path)[0] + "_filled.pdf"
            img.save(pdf_path, "PDF", resolution=300.0)
            
        print(f"✅ Image fill processing successful: {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"❌ Image fill processing failed: {e}")
        return None

def print_file(file_path, copies=1, page_range=None, printer_name=BW_PRINTER_NAME):
    try:
        file_size = os.path.getsize(file_path)
        if file_size < 100:
            print(f"❌ File too small ({file_size} bytes)")
            return False

        if file_path.endswith('.pdf'):
            with open(file_path, 'rb') as f:
                header = f.read(8)
            if not header.startswith(b'%PDF'):
                print(f"❌ File not a valid PDF")
                return False

        print(f"🖨️  Sending to CUPS Printer [{printer_name}]: {file_path} ({copies} copies, pages: {page_range or 'all'})")
        cmd = ["lp", "-d", printer_name, "-n", str(copies)]
        if page_range:
            cmd.extend(["-P", str(page_range)])
        cmd.append(file_path)
        
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=15)
        lp_output = result.stdout.strip()
        print(f"CUPS: {lp_output}")
        
        time.sleep(2)
        import re
        match = re.search(r'is (\S+-\d+)', lp_output)
        if match:
            job_id = match.group(1)
            status_result = subprocess.run(["lpstat", "-l", job_id], capture_output=True, text=True, timeout=10)
            status_output = status_result.stdout
            if "job-completed-with-errors" in status_output or "loadFilename failed" in status_output:
                print(f"❌ CUPS rendered the job with errors")
                return False

        print("✅ Print job submitted and verified successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Print failed: {e.stderr.strip() if e.stderr else str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected print error: {e}")
        return False

def download_file(file_url, file_name):
    try:
        safe_name = "".join([c for c in file_name if c.isalpha() or c.isdigit() or c in ' ._-']).rstrip()
        local_path = os.path.join(TEMP_DIR, f"{int(time.time())}_{safe_name}")
        print(f"⬇️  Downloading from Firebase...")
        blob_path = None

        if file_url.startswith("gs://"):
            blob_path = file_url.split(bucket.name + "/")[1]
        elif "firebasestorage.googleapis.com" in file_url and "/o/" in file_url:
            path = file_url.split("/o/")[1].split("?")[0]
            blob_path = urllib.parse.unquote(path)
        elif "storage.googleapis.com/" in file_url:
            if f"/{bucket.name}/" in file_url:
                path = file_url.split(f"/{bucket.name}/")[1].split("?")[0]
                blob_path = urllib.parse.unquote(path)

        if blob_path:
            blob = bucket.blob(blob_path)
            blob.download_to_filename(local_path)
        else:
            response = requests.get(file_url, stream=True, timeout=30)
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
    doc = doc_snapshot.to_dict()
    doc_id = doc_snapshot.id
    doc_ref = db.collection('print_jobs').document(doc_id)
    
    file_url = doc.get("fileUrl")
    file_name = doc.get("fileName", "document.pdf")
    copies = doc.get("copies", 1)
    color_mode = doc.get("colorMode", "monochrome")
    
    print_options = doc.get("printOptions", {})
    image_scaling = print_options.get("imageScaling", "fit")
    page_selection = print_options.get("pageSelection") or print_options.get("pagesToPrint") or "all"
    page_range = None
    if page_selection == "custom":
        page_range = print_options.get("pageRange") or print_options.get("customPageRange")
    
    local_path = None
    final_path = None

    # Dynamic Printer Selection
    target_printer = COLOR_PRINTER_NAME if color_mode.lower() == "color" else BW_PRINTER_NAME

    try:
        local_path = download_file(file_url, file_name)
        if not local_path:
            doc_ref.update({"status": "failed", "printerStatus": "Failed to download on Pi"})
            return

        final_path = local_path
        ext = os.path.splitext(local_path)[1].lower()
        
        if ext in [".jpg", ".jpeg", ".png"] and image_scaling == "fill":
            pdf_path = process_image_fill(local_path)
            if pdf_path:
                final_path = pdf_path
                
        elif ext in [".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls"]:
            pdf_path = convert_to_pdf(local_path)
            if pdf_path:
                final_path = pdf_path
            else:
                doc_ref.update({"status": "failed", "printerStatus": "LibreOffice conversion failed"})
                return

        success = print_file(final_path, copies, page_range, target_printer)
        
        if success:
            doc_ref.update({
                "status": "completed", 
                "isPrinted": True, 
                "printerStatus": "Printed",
                "printedAt": firestore.SERVER_TIMESTAMP
            })
            print(f"🎉 Job {doc_id} marked as completed.")
        else:
            doc_ref.update({"status": "failed", "printerStatus": "CUPS error on Pi"})
            
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        doc_ref.update({"status": "failed", "printerStatus": f"Pi processing error: {str(e)[:50]}"})
    finally:
        try:
            if local_path and os.path.exists(local_path):
                os.remove(local_path)
            if final_path and final_path != local_path and os.path.exists(final_path):
                os.remove(final_path)
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")

def on_snapshot(col_snapshot, changes, read_time):
    for change in changes:
        if change.type.name in ['ADDED', 'MODIFIED']:
            doc = change.document
            data = doc.to_dict()
            
            updated_at = data.get("updatedAt")
            if updated_at:
                now = datetime.now(updated_at.tzinfo)
                if (now - updated_at) > timedelta(minutes=15):
                    print(f"⚠️ Skipping job {doc.id} - older than 15 minutes")
                    db.collection('print_jobs').document(doc.id).update({"status": "failed", "printerStatus": "Job expired"})
                    continue
            
            if data.get("status") == "printing" and not data.get("isPrinted", False):
                print(f"\n🔔 New {data.get('colorMode', 'monochrome')} job detected: {doc.id}")
                threading.Thread(target=process_job, args=(doc,), daemon=True).start()

def heartbeat_loop():
    while True:
        try:
            status_bw = "Online"
            status_color = "Online"
            try:
                res_bw = subprocess.run(["lpstat", "-p", BW_PRINTER_NAME], capture_output=True, text=True).stdout.lower()
                status_bw = "Paused/Error" if "disabled" in res_bw or "paused" in res_bw else ("Printing" if "printing" in res_bw else "Idle")

                res_color = subprocess.run(["lpstat", "-p", COLOR_PRINTER_NAME], capture_output=True, text=True).stdout.lower()
                status_color = "Paused/Error" if "disabled" in res_color or "paused" in res_color else ("Printing" if "printing" in res_color else "Idle")
            except:
                status_bw = "lpstat failed"
                status_color = "lpstat failed"
                
            db.collection("system_status").document(KIOSK_ID).set({
                "lastSeen": firestore.SERVER_TIMESTAMP,
                "printerStatus": f"B&W: {status_bw} | Color: {status_color}"
            }, merge=True)
        except Exception as e:
            print(f"⚠️ Heartbeat failed: {e}")
        time.sleep(30)

def watchdog_loop():
    stuck_cycles = {BW_PRINTER_NAME: 0, COLOR_PRINTER_NAME: 0}
    while True:
        try:
            for printer in [BW_PRINTER_NAME, COLOR_PRINTER_NAME]:
                # Only re-enable if the printer is currently disabled
                status_res = subprocess.run(["lpstat", "-p", printer], capture_output=True, text=True)
                if "disabled" in status_res.stdout.lower():
                    print(f"⚠️ Watchdog: {printer} is disabled — re-enabling...")
                    subprocess.run(["sudo", "cupsenable", printer], capture_output=True)

            result = subprocess.run(["lpstat", "-W", "not-completed"], capture_output=True, text=True)

            for printer in [BW_PRINTER_NAME, COLOR_PRINTER_NAME]:
                if printer in result.stdout:
                    stuck_cycles[printer] += 1
                    print(f"⚠️ Watchdog: Stuck job detected on {printer} (Cycle {stuck_cycles[printer]})")

                    if stuck_cycles[printer] >= 2:
                        print(f"🔧 Watchdog: Kicking ipp-usb to wake up sleeping printer {printer}...")
                        subprocess.run(["sudo", "systemctl", "restart", "ipp-usb"], capture_output=True)
                        subprocess.run(["sudo", "cupsenable", printer], capture_output=True)
                        stuck_cycles[printer] = 0
                else:
                    stuck_cycles[printer] = 0
        except Exception as e:
            print(f"⚠️ Watchdog failed: {e}")
        time.sleep(60)

def keep_warm_loop():
    while True:
        try:
            requests.get("https://api-upqxuj7evq-uc.a.run.app/", timeout=10)
        except:
            pass
        time.sleep(600)

# Start background threads
threading.Thread(target=heartbeat_loop, daemon=True).start()
threading.Thread(target=watchdog_loop, daemon=True).start()
threading.Thread(target=keep_warm_loop, daemon=True).start()

print(f"📡 Pi Listener Started. Identity: {KIOSK_ID}")
print(f"📡 Target Printers -> B&W: {BW_PRINTER_NAME} | Color: {COLOR_PRINTER_NAME}")
print(f"📡 Waiting for jobs (status: 'printing', kioskId: '{KIOSK_ID}')...")

query = db.collection('print_jobs').where('status', '==', 'printing').where('kioskId', '==', KIOSK_ID)
query_watch = query.on_snapshot(on_snapshot)

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n🛑 Shutting down listener.")
