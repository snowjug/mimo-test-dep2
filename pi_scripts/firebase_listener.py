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

def process_image_custom(input_path, scale_pct):
    try:
        from PIL import Image
        print(f"⏳ Processing image for CUSTOM scale ({scale_pct}%) to A4: {input_path}")
        
        with Image.open(input_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
                
            # A4 at 300 DPI is 2480x3508
            canvas_w, canvas_h = 2480, 3508
            
            # Determine orientation
            original_w, original_h = img.size
            is_landscape = original_w > original_h
            if is_landscape:
                canvas_w, canvas_h = 3508, 2480
                
            canvas = Image.new('RGB', (canvas_w, canvas_h), (255, 255, 255))
            
            # Max width and height the image can take (Fit to A4)
            fit_ratio = min(canvas_w / original_w, canvas_h / original_h)
            fit_w = int(original_w * fit_ratio)
            fit_h = int(original_h * fit_ratio)
            
            # Now scale it down by the user's custom percentage
            final_w = max(1, int(fit_w * (scale_pct / 100.0)))
            final_h = max(1, int(fit_h * (scale_pct / 100.0)))
            
            # Resize image
            resized_img = img.resize((final_w, final_h), Image.Resampling.LANCZOS)
            
            # Paste exactly in the center
            paste_x = (canvas_w - final_w) // 2
            paste_y = (canvas_h - final_h) // 2
            canvas.paste(resized_img, (paste_x, paste_y))
            
            pdf_path = os.path.splitext(input_path)[0] + "_custom.pdf"
            canvas.save(pdf_path, "PDF", resolution=300.0)
            
        print(f"✅ Image custom scale processing successful: {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"❌ Image custom scale processing failed: {e}")
        return None

def print_file(file_paths, copies=1, page_range=None, printer_name=BW_PRINTER_NAME, photo_layout=None, double_sided="single", is_blank_sheet=False):
    try:
        total_size = sum(os.path.getsize(p) for p in file_paths)
        if total_size < 100:
            print("❌ Invalid file(s) size")
            return False

        for file_path in file_paths:
            if file_path.endswith('.pdf'):
                with open(file_path, 'rb') as f:
                    header = f.read(8)
                if not header.startswith(b'%PDF'):
                    print(f"❌ File not a valid PDF")
                    return False

        print(f"🖨️  Sending to CUPS Printer [{printer_name}]: {file_paths} ({copies} copies, pages: {page_range or 'all'})")
        cmd = ["lp", "-d", printer_name, "-n", str(copies)]
        if page_range:
            cmd.extend(["-P", str(page_range)])
        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"]:
            cmd.extend(["-o", f"number-up={photo_layout}"])
            
        if double_sided == "double":
            cmd.extend(["-o", "sides=two-sided-long-edge"])
        
        # Enforce exact 100% scale ONLY for graph paper / blank sheets so grid lines don't distort.
        # User documents must be allowed to scale to support N-up layouts (4-per-page) and hardware margins.
        if is_blank_sheet:
            cmd.extend(["-o", "print-scaling=none"])
        
        cmd.extend(file_paths)
        
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=15)
        lp_output = result.stdout.strip()
        print(f"CUPS: {lp_output}")
        
        # FAST MODE: We do not wait for the physical printer to finish warming up and printing.
        # As soon as it's in the CUPS queue, we tell the UI it's done so the user doesn't wait at 99%.
        # The background watchdog thread will ensure the physical printer eventually prints it.
        print("✅ Print job spooled successfully! Returning immediately for FAST UI response.")
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
    custom_scale = int(print_options.get("customScale", 100))
    photo_layout = print_options.get("photoLayout")
    double_sided = print_options.get("doubleSided", "single")
    is_blank_sheet = print_options.get("isBlankSheet", False)
    page_selection = print_options.get("pageSelection") or print_options.get("pagesToPrint") or "all"
    page_range = None
    if page_selection == "custom":
        page_range = print_options.get("pageRange") or print_options.get("customPageRange")
    
    files = doc.get("files")
    if not files:
        files = [{"url": file_url, "name": file_name, "type": doc.get("mimetype")}]
        
    local_paths = []
    final_paths = []

    # Dynamic Printer Selection
    target_printer = COLOR_PRINTER_NAME if color_mode.lower() == "color" else BW_PRINTER_NAME

    try:
        for f in files:
            f_url = f.get("url")
            f_name = f.get("name", "document.pdf")
            l_path = download_file(f_url, f_name)
            if not l_path:
                doc_ref.update({"status": "failed", "printerStatus": f"Failed to download {f_name}"})
                return
            local_paths.append(l_path)
            
            f_final = l_path
            ext = os.path.splitext(l_path)[1].lower()
            
            if ext in [".jpg", ".jpeg", ".png"]:
                if image_scaling == "fill":
                    pdf_path = process_image_fill(l_path)
                    if pdf_path: f_final = pdf_path
                elif image_scaling == "custom":
                    pdf_path = process_image_custom(l_path, custom_scale)
                    if pdf_path: f_final = pdf_path
                    
            elif ext in [".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls"]:
                pdf_path = convert_to_pdf(l_path)
                if pdf_path: f_final = pdf_path
                else:
                    doc_ref.update({"status": "failed", "printerStatus": f"LibreOffice failed for {f_name}"})
                    return
            
            final_paths.append(f_final)

        # Merge images into a single PDF if doing an N-up layout, because CUPS number-up 
        # only groups pages of a SINGLE document, not separate files.
        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"] and len(final_paths) > 1:
            print(f"🖼️ Merging {len(final_paths)} images into a single PDF for {photo_layout}-per-page layout...")
            merged_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_merged_layout.pdf")
            try:
                subprocess.run(["convert"] + final_paths + [merged_pdf], check=True, timeout=45)
                # Cleanup the individual files since they are merged
                for fp in final_paths:
                    if os.path.exists(fp): os.remove(fp)
                final_paths = [merged_pdf]
                print(f"✅ Successfully merged images into {merged_pdf}")
            except Exception as merge_err:
                print(f"❌ Failed to merge images with ImageMagick: {merge_err}")

        # Correct stale queue names on Kiosk 1 to point to the active USB interface
        if target_printer == "Brother_HL_L5210DN_series":
            target_printer = "Brother_HL_L5210DN_series_USB"

        success = print_file(final_paths, copies, page_range, target_printer, photo_layout, double_sided, is_blank_sheet)
        
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
            for lp in local_paths:
                if lp and os.path.exists(lp): os.remove(lp)
            for fp in final_paths:
                if fp and fp not in local_paths and os.path.exists(fp): os.remove(fp)
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

                    if stuck_cycles[printer] >= 3:
                        print(f"🔧 Watchdog: Kicking ipp-usb to wake up sleeping printer {printer}...")
                        subprocess.run(["sudo", "systemctl", "restart", "ipp-usb"], capture_output=True)
                        subprocess.run(["sudo", "cupsenable", printer], capture_output=True)
                        stuck_cycles[printer] = 0
                else:
                    stuck_cycles[printer] = 0
        except Exception as e:
            print(f"⚠️ Watchdog failed: {e}")
        time.sleep(15)

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
