import firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud.firestore_v1.base_query import FieldFilter

import time
import subprocess
import os
import urllib.parse
from datetime import datetime, timedelta
import threading
import requests

active_jobs = set()

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
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        
        pdf_path = os.path.splitext(input_path)[0] + ".pdf"
        if os.path.exists(pdf_path):
            print(f"✅ Conversion successful: {pdf_path}")
            return pdf_path
        else:
            raise Exception("PDF file not found after conversion")
    except subprocess.CalledProcessError as e:
        print(f"❌ Conversion failed: {e}")
        return None

def process_image_fill(input_path, photo_layout=None, is_color=False):
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
                
            # Use 150 DPI for color (faster for Epson inkjet), 300 for BW laser
            dpi = 150.0 if is_color else 300.0
                
            # If the image is extremely large, resize it to match the target DPI to save memory
            target_w = int(8.27 * dpi)
            target_h = int(11.69 * dpi)
            if img.size[0] > target_w * 1.5:
                img.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
                
            pdf_path = os.path.splitext(input_path)[0] + "_filled.pdf"
            img.save(pdf_path, "PDF", resolution=dpi)
            
        print(f"✅ Image fill processing successful: {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"❌ Image fill processing failed: {e}")
        return None

def process_image_custom(input_path, scale_pct, is_color=False):
    try:
        from PIL import Image
        print(f"⏳ Processing image for CUSTOM scale ({scale_pct}%) to A4: {input_path}")
        
        # Use 150 DPI for color (faster for Epson), 300 for BW
        dpi = 150.0 if is_color else 300.0
        
        with Image.open(input_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
                
            # A4 at target DPI
            canvas_w = int(8.27 * dpi)
            canvas_h = int(11.69 * dpi)
            
            # Determine orientation
            original_w, original_h = img.size
            is_landscape = original_w > original_h
            if is_landscape:
                canvas_w, canvas_h = canvas_h, canvas_w
                
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
            canvas.save(pdf_path, "PDF", resolution=dpi)
            
        print(f"✅ Image custom scale processing successful: {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"❌ Image custom scale processing failed: {e}")
        return None

def slice_pdf_pages(input_pdf, page_range):
    """Extract specific pages from a PDF using Ghostscript.
    
    Supports complex ranges like: '1-3,5,7-9'
    """
    try:
        output_pdf = os.path.splitext(input_pdf)[0] + f"_sliced_{int(time.time())}.pdf"
        print(f"✂️  Slicing PDF pages [{page_range}] from {input_pdf}...")
        
        # Parse the complex range into individual page numbers
        pages = []
        for part in str(page_range).split(","):
            part = part.strip()
            if not part:
                continue
            if "-" in part:
                range_parts = part.split("-")
                if len(range_parts) == 2:
                    try:
                        start = int(range_parts[0])
                        end = int(range_parts[1])
                        for p in range(start, end + 1):
                            pages.append(p)
                    except ValueError:
                        continue
            else:
                try:
                    pages.append(int(part))
                except ValueError:
                    continue
        
        if not pages:
            print("⚠️ No valid pages in range, returning original")
            return input_pdf
        
        pages = sorted(set(pages))
        
        # Extract each page individually and merge
        temp_pages = []
        for page_num in pages:
            temp_page = os.path.join(TEMP_DIR, f"page_{page_num}_{int(time.time()*1000)}.pdf")
            cmd = [
                "gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite",
                f"-dFirstPage={page_num}", f"-dLastPage={page_num}",
                f"-sOutputFile={temp_page}", input_pdf
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            if result.returncode == 0 and os.path.exists(temp_page):
                temp_pages.append(temp_page)
        
        if not temp_pages:
            print("⚠️ Ghostscript failed to extract any pages")
            return input_pdf
        
        if len(temp_pages) == 1:
            os.rename(temp_pages[0], output_pdf)
        else:
            merge_cmd = ["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite",
                        f"-sOutputFile={output_pdf}"] + temp_pages
            subprocess.run(merge_cmd, check=True, timeout=60)
            for tp in temp_pages:
                try:
                    os.remove(tp)
                except:
                    pass
        
        if os.path.exists(output_pdf):
            print(f"✅ Sliced {len(pages)} pages successfully: {output_pdf}")
            return output_pdf
        else:
            return input_pdf
            
    except Exception as e:
        print(f"❌ Page slicing failed: {e}")
        return input_pdf

def convert_image_to_pdf_fit(input_path, is_color=False):
    """Convert an image to PDF for 'fit' mode so CUPS number-up works reliably."""
    try:
        from PIL import Image
        dpi = 150.0 if is_color else 300.0
        pdf_path = os.path.splitext(input_path)[0] + "_fit.pdf"
        with Image.open(input_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(pdf_path, "PDF", resolution=dpi)
        print(f"✅ Image fit → PDF: {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"❌ Image fit conversion failed: {e}")
        return None

def impose_nup(input_pdf, output_pdf, layout_num):
    """Natively impose N-up pages onto an A4 canvas using PyPDF2."""
    try:
        from PyPDF2 import PdfReader, PdfWriter, PageObject, Transformation
        reader = PdfReader(input_pdf)
        writer = PdfWriter()
        
        A4_W, A4_H = 595.276, 841.890
        
        if str(layout_num) == "2":
            cols, rows = 2, 1
            canvas_w, canvas_h = A4_H, A4_W
        elif str(layout_num) == "4":
            cols, rows = 2, 2
            canvas_w, canvas_h = A4_W, A4_H
        elif str(layout_num) == "6":
            cols, rows = 3, 2
            canvas_w, canvas_h = A4_H, A4_W
        elif str(layout_num) == "9":
            cols, rows = 3, 3
            canvas_w, canvas_h = A4_W, A4_H
        else:
            return False
            
        cell_w = canvas_w / cols
        cell_h = canvas_h / rows
        
        pages = reader.pages
        total_pages = len(pages)
        
        current_page_idx = 0
        while current_page_idx < total_pages:
            new_page = PageObject.create_blank_page(width=canvas_w, height=canvas_h)
            for row in range(rows):
                for col in range(cols):
                    if current_page_idx >= total_pages:
                        break
                    p = pages[current_page_idx]
                    p_w = float(p.mediabox.width)
                    p_h = float(p.mediabox.height)
                    
                    scale = min(cell_w / p_w, cell_h / p_h)
                    
                    tx = (col * cell_w) + (cell_w - (p_w * scale)) / 2
                    ty = ((rows - 1 - row) * cell_h) + (cell_h - (p_h * scale)) / 2
                    
                    op = Transformation().scale(sx=scale, sy=scale).translate(tx=tx, ty=ty)
                    new_page.merge_page(p, op)
                    
                    current_page_idx += 1
            writer.add_page(new_page)
            
        with open(output_pdf, "wb") as f:
            writer.write(f)
        return True
    except Exception as e:
        print(f"❌ PyPDF2 N-up Imposition failed: {e}")
        return False

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



        sliced_paths = []
        if page_range:
            for p in file_paths:
                sliced = slice_pdf_pages(p, page_range)
                sliced_paths.append(sliced)
            file_paths = sliced_paths

        print(f"🖨️  Sending to CUPS [{printer_name}]: {[os.path.basename(f) for f in file_paths]} "
              f"({copies} copies, layout: {photo_layout or '1-up'}, sides: {double_sided})")
        cmd = ["lp", "-d", printer_name, "-n", str(copies), "-o", "media=A4", "-o", "fit-to-page"]

        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"]:
            cmd.extend(["-o", f"number-up={photo_layout}"])
            
        if double_sided == "double":
            cmd.extend(["-o", "sides=two-sided-long-edge"])
        
        if is_blank_sheet:
            cmd.extend(["-o", "print-scaling=none"])
        
        cmd.extend(file_paths)
        
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=15)
        lp_output = result.stdout.strip()
        print(f"CUPS: {lp_output}")
        
        total_pages = 0
        try:
            from PyPDF2 import PdfReader
            for f in file_paths:
                reader = PdfReader(f)
                total_pages += len(reader.pages)
        except Exception:
            total_pages = 1
            
        total_physical_pages = total_pages * copies
        
        import re
        match = re.search(r'request id is (\S+)', lp_output)
        if match:
            job_id = match.group(1)
            print(f"⏳ Waiting for CUPS job {job_id} to spool and physically finish printing...")
            timeout_counter = 0
            while timeout_counter < 400:  # 10 minutes max wait per file batch (400 * 1.5s = 600s)
                try:
                    active_jobs = subprocess.run(["lpstat", "-o"], capture_output=True, text=True).stdout
                    if job_id not in active_jobs:
                        # Job is out of the queue, now ensure the physical printer is idle
                        status_res = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True).stdout.lower()
                        if "printing" not in status_res:
                            eject_delay = 3.0 + (total_physical_pages * 1.5)
                            print(f"✅ CUPS job {job_id} completed. Waiting {eject_delay:.1f}s for physical paper ejection...")
                            time.sleep(eject_delay)
                            print(f"✅ Physical print considered fully ejected!")
                            break
                except Exception as e:
                    print(f"⚠️ lpstat check failed: {e}")
                time.sleep(1.5)
                timeout_counter += 1
            if timeout_counter >= 400:
                print(f"⚠️ Timeout waiting for job {job_id} physically. Assuming complete or stuck.")
        
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
            response = requests.get(file_url, stream=True, timeout=120)
            response.raise_for_status()
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        
        print(f"✅ Downloaded to: {local_path}")
        return local_path
    except Exception as e:
        print(f"❌ Download failed: {e}")
        return None


def safe_update(doc_ref, data):
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

def process_job(doc_snapshot):
    doc = doc_snapshot.to_dict()
    doc_id = doc_snapshot.id
    doc_ref = db.collection('print_jobs').document(doc_id)
    
    file_url = doc.get("fileUrl")
    file_name = doc.get("fileName", "document.pdf")
    color_mode = doc.get("colorMode", "monochrome")
    is_color = color_mode.lower() == "color"
    
    print_options = doc.get("printOptions", {})
    # Read copies from printOptions (where frontend stores it), fallback to top-level
    copies = int(print_options.get("copies", doc.get("copies", 1)))
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
                safe_update(doc_ref, {"status": "failed", "printerStatus": f"Failed to download {f_name}"})
                return
            local_paths.append(l_path)
            
            f_final = l_path
            ext = os.path.splitext(l_path)[1].lower()
            
            if ext in [".jpg", ".jpeg", ".png"]:
                if image_scaling == "fill":
                    pdf_path = process_image_fill(l_path, photo_layout, is_color)
                    if pdf_path: f_final = pdf_path
                elif image_scaling == "custom":
                    pdf_path = process_image_custom(l_path, custom_scale, is_color)
                    if pdf_path: f_final = pdf_path
                else:
                    # FIT mode: still convert to PDF so CUPS number-up works reliably
                    pdf_path = convert_image_to_pdf_fit(l_path, is_color)
                    if pdf_path: f_final = pdf_path
                    
            elif ext in [".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls"]:
                pdf_path = convert_to_pdf(l_path)
                if pdf_path: f_final = pdf_path
                else:
                    safe_update(doc_ref, {"status": "failed", "printerStatus": f"LibreOffice failed for {f_name}"})
                    return
            
            final_paths.append(f_final)

        # Ensure all files are PDFs before merging
        pdf_paths = []
        for fp in final_paths:
            if fp.lower().endswith(('.jpg', '.jpeg', '.png')):
                pdf_fp = fp + ".pdf"
                try:
                    from PIL import Image
                    with Image.open(fp) as img:
                        img.convert("RGB").save(pdf_fp)
                    pdf_paths.append(pdf_fp)
                except Exception as e:
                    print(f"❌ Failed to wrap image in PDF: {e}")
                    pdf_paths.append(fp)
            else:
                pdf_paths.append(fp)

        # Imposition with PyPDF2 for consistent N-up layouts
        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"]:
            print(f"🖼️ Generating consistent {photo_layout}-per-page layout using PyPDF2...")
            merged_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_merged_layout.pdf")
            imposed_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_imposed_layout.pdf")
            
            try:
                # 1. Merge if multiple files
                if len(pdf_paths) > 1:
                    subprocess.run(["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite", f"-sOutputFile={merged_pdf}"] + pdf_paths, check=True, timeout=60)
                else:
                    merged_pdf = pdf_paths[0]
                    
                # 2. Impose using PyPDF2
                success_nup = impose_nup(merged_pdf, imposed_pdf, photo_layout)
                
                if success_nup:
                    final_paths = [imposed_pdf]
                    photo_layout = None # Clear it so CUPS doesn't impose again
                    print(f"✅ Successfully imposed layout into {imposed_pdf}")
                else:
                    raise Exception("PyPDF2 N-up returned False")
                    
            except Exception as jam_err:
                print(f"❌ Failed to impose PDF natively: {jam_err}")
                raise Exception("Layout generation failed on Kiosk.")
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
            safe_update(doc_ref, {"status": "failed", "printerStatus": "CUPS error on Pi"})

            
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        safe_update(doc_ref, {"status": "failed", "printerStatus": f"Pi processing error: {str(e)[:50]}"})

    finally:
        try:
            for lp in local_paths:
                if lp and os.path.exists(lp): os.remove(lp)
            for fp in final_paths:
                if fp and fp not in local_paths and os.path.exists(fp): os.remove(fp)
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")
        finally:
            active_jobs.discard(doc_id)

def on_snapshot(col_snapshot, changes, read_time):
    print(f"Snapshot fired! Changes: {len(changes)}")
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
                if doc.id not in active_jobs:
                    active_jobs.add(doc.id)
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
            
            # Fallback polling for silent grpc disconnects
            docs = db.collection('print_jobs').where(filter=FieldFilter('status', '==', 'printing')).where(filter=FieldFilter('kioskId', '==', KIOSK_ID)).stream()
            for doc in docs:
                if doc.id not in active_jobs:
                    data = doc.to_dict()
                    updated_at = data.get("updatedAt")
                    if updated_at:
                        now = datetime.now(updated_at.tzinfo)
                        if (now - updated_at) > timedelta(minutes=15):
                            continue
                    print(f"\n⚠️ Fallback detected stuck job: {doc.id}")
                    active_jobs.add(doc.id)
                    threading.Thread(target=process_job, args=(doc,), daemon=True).start()
                    
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

query = db.collection('print_jobs').where(filter=FieldFilter('status', '==', 'printing')).where(filter=FieldFilter('kioskId', '==', KIOSK_ID))
query_watch = query.on_snapshot(on_snapshot)

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n🛑 Shutting down listener.")
