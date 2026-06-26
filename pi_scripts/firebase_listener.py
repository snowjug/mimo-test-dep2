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

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    print("✅ Registered pillow_heif opener")
except ImportError:
    print("⚠️ pillow_heif not installed. HEIC image support will be disabled.")

active_jobs = set()

# ================= CONFIGURATION =================
BW_PRINTER_NAME = os.environ.get("BW_PRINTER_NAME", "Brother_HL_L2440DW_series")
COLOR_PRINTER_NAME = os.environ.get("COLOR_PRINTER_NAME", "Epson_L3250")
# Kiosk Routing Identity
KIOSK_ID = os.environ.get("KIOSK_ID", "KIOSK_1")
TEMP_DIR = "/tmp/mimo_prints"
# Set IS_MONOCHROME_ONLY=true in service env for printers that only support B&W (e.g. CV-001)
IS_MONOCHROME_ONLY = os.environ.get("IS_MONOCHROME_ONLY", "false").lower() == "true"

# Mapping of CUPS printer names to their USB Vendor/Product IDs
PRINTER_USB_IDS = {
    # SV-002 / pi
    "Brother_HL_L2440DW_series": "04f9:0587",
    "Epson_L3250": "04b8:118a",
    "L3250-Series": "04b8:118a",
    
    # CV-001 / printpi
    "Brother_HL_L5210DN_series_USB": "04f9:0503",
    "Brother_HL_L5210DN_series": "04f9:0503",
    "Brother_IPP": "04f9:0503",
    "Brother": "04f9:0503"
}

if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# ── Ghostscript compression presets ──
# /ebook  → downsample images to 150 DPI; great for B&W laser (small spool, fast USB transfer)
# /screen → 72 DPI (too low for print quality)
# /printer → 300 DPI (keeps full quality but no size reduction)
GS_BW_COMPRESS  = ["-dPDFSETTINGS=/ebook",  "-dCompatibilityLevel=1.4",
                   "-dEmbedAllFonts=true",   "-dSubsetFonts=true"]
GS_COLOR_COMPRESS = ["-dPDFSETTINGS=/printer", "-dCompatibilityLevel=1.4",
                     "-dEmbedAllFonts=true",    "-dSubsetFonts=true"]

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
            ] + GS_BW_COMPRESS + [
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
            merge_cmd = ["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite"
                        ] + GS_BW_COMPRESS + [f"-sOutputFile={output_pdf}"] + temp_pages
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
    """Convert an image to PDF for 'fit' mode so CUPS number-up works reliably.
    
    IMPORTANT: Image is resized to A4 dimensions at target DPI before saving.
    This ensures GS rasterizes a proper A4-sized page, so impose_nup cells
    get a full-resolution image to work with (avoids tiny source pages).
    """
    try:
        from PIL import Image
        dpi = 150.0 if is_color else 300.0
        pdf_path = os.path.splitext(input_path)[0] + "_fit.pdf"
        with Image.open(input_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            # A4 dimensions at target DPI
            a4_portrait_w = int(8.27 * dpi)   # ~1240 @ 150dpi, ~2480 @ 300dpi
            a4_portrait_h = int(11.69 * dpi)  # ~1754 @ 150dpi, ~3508 @ 300dpi
            orig_w, orig_h = img.size
            # Choose canvas orientation to best match image orientation
            if orig_w > orig_h:  # landscape image
                canvas_w, canvas_h = a4_portrait_h, a4_portrait_w  # landscape A4
            else:  # portrait image
                canvas_w, canvas_h = a4_portrait_w, a4_portrait_h  # portrait A4
            # Fit image into A4 canvas (letterbox / contain mode)
            scale = min(canvas_w / orig_w, canvas_h / orig_h)
            new_w = int(orig_w * scale)
            new_h = int(orig_h * scale)
            resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            canvas = Image.new('RGB', (canvas_w, canvas_h), (255, 255, 255))
            paste_x = (canvas_w - new_w) // 2
            paste_y = (canvas_h - new_h) // 2
            canvas.paste(resized, (paste_x, paste_y))
            canvas.save(pdf_path, "PDF", resolution=dpi)
        print(f"✅ Image fit → PDF ({canvas_w}x{canvas_h}px @ {dpi}dpi): {pdf_path}")
        return pdf_path
    except Exception as e:
        print(f"❌ Image fit conversion failed: {e}")
        return None

def impose_nup(input_pdf, output_pdf, layout_num):
    """
    Impose N-up pages onto an A4 canvas using Ghostscript + Pillow.
    Works on both Pi nodes (neither has PyPDF2 installed).
    GS rasterizes each PDF page → PNG; Pillow composites them onto A4 canvas.
    """
    try:
        from PIL import Image
        import math

        n = int(layout_num)
        if n not in (2, 4, 6, 9):
            print(f"❌ impose_nup: unsupported layout {n}")
            return False

        # Layout grid + canvas orientation
        if n == 2:
            cols, rows = 2, 1
            canvas_w_px, canvas_h_px = 3508, 2480  # A4 landscape @ 300dpi
            is_landscape = True
        elif n == 4:
            cols, rows = 2, 2
            canvas_w_px, canvas_h_px = 2480, 3508  # A4 portrait @ 300dpi
            is_landscape = False
        elif n == 6:
            cols, rows = 3, 2
            canvas_w_px, canvas_h_px = 3508, 2480  # A4 landscape @ 300dpi
            is_landscape = True
        else:  # 9
            cols, rows = 3, 3
            canvas_w_px, canvas_h_px = 2480, 3508  # A4 portrait @ 300dpi
            is_landscape = False

        cell_w = canvas_w_px // cols
        cell_h = canvas_h_px // rows

        # Get total page count via pdfinfo (or GS fallback)
        total_pages = 1
        try:
            pi_res = subprocess.run(["pdfinfo", input_pdf], capture_output=True, text=True, timeout=10)
            for line in pi_res.stdout.split("\n"):
                if "Pages:" in line:
                    total_pages = int(line.split(":")[1].strip())
        except Exception:
            pass
        print(f"📄 impose_nup: {total_pages} source pages → {n}-up layout ({cols}×{rows})")

        # Rasterize each PDF page to a temp PNG at 150 DPI (fast, good quality)
        DPI = 150
        scale_factor = DPI / 300.0
        cell_w_s = int(cell_w * scale_factor)
        cell_h_s = int(cell_h * scale_factor)
        canvas_w_s = int(canvas_w_px * scale_factor)
        canvas_h_s = int(canvas_h_px * scale_factor)

        page_imgs = []
        # If single-page source, replicate it n times (e.g. photo printing)
        pages_to_render = list(range(1, total_pages + 1)) if total_pages > 1 else [1] * n
        
        for pg in pages_to_render:
            tmp_img = os.path.join(TEMP_DIR, f"_nup_pg{pg}_{int(time.time()*1000)}.png")
            gs_cmd = [
                "gs", "-dNOPAUSE", "-dBATCH", "-q",
                "-sDEVICE=png16m", f"-r{DPI}",
                f"-dFirstPage={pg}", f"-dLastPage={pg}",
                f"-sOutputFile={tmp_img}", input_pdf
            ]
            result = subprocess.run(gs_cmd, capture_output=True, timeout=30)
            if result.returncode == 0 and os.path.exists(tmp_img):
                page_imgs.append(tmp_img)
            else:
                print(f"⚠️ GS rasterize failed for page {pg}: {result.stderr.decode()[:100]}")

        if not page_imgs:
            print("❌ impose_nup: no pages could be rasterized")
            return False

        # Build output PDF — one canvas sheet per N pages
        output_sheets = []
        idx = 0
        while idx < len(page_imgs):
            canvas_img = Image.new("RGB", (canvas_w_s, canvas_h_s), (255, 255, 255))
            for row in range(rows):
                for col in range(cols):
                    if idx >= len(page_imgs):
                        break
                    with Image.open(page_imgs[idx]) as pg_img:
                        if pg_img.mode != 'RGB':
                            pg_img = pg_img.convert('RGB')
                        img_w, img_h = pg_img.size
                        # Auto-rotate: if image is landscape but cell is portrait (or vice versa),
                        # rotate 90° if it would give better coverage of the cell.
                        cell_ratio = cell_w_s / cell_h_s
                        img_ratio  = img_w / img_h if img_h > 0 else 1.0
                        # Coverage with no rotation vs with rotation
                        def coverage(iw, ih, cw, ch):
                            s = min(cw / iw, ch / ih)
                            return (iw * s * ih * s) / (cw * ch)
                        cov_normal  = coverage(img_w, img_h, cell_w_s, cell_h_s)
                        cov_rotated = coverage(img_h, img_w, cell_w_s, cell_h_s)
                        if cov_rotated > cov_normal + 0.05:  # rotate only if meaningfully better
                            pg_img = pg_img.rotate(90, expand=True)
                            img_w, img_h = pg_img.size
                        # Scale image to fill cell (contain mode, scales UP and DOWN)
                        scale = min(cell_w_s / img_w, cell_h_s / img_h)
                        new_w = max(1, int(img_w * scale))
                        new_h = max(1, int(img_h * scale))
                        pg_img = pg_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                        paste_x = col * cell_w_s + (cell_w_s - new_w) // 2
                        paste_y = row * cell_h_s + (cell_h_s - new_h) // 2
                        canvas_img.paste(pg_img, (paste_x, paste_y))
                    idx += 1
            sheet_path = os.path.join(TEMP_DIR, f"_nup_sheet_{idx}_{int(time.time()*1000)}.pdf")
            canvas_img.save(sheet_path, "PDF", resolution=DPI)
            output_sheets.append(sheet_path)

        # Merge all sheets into final output PDF
        if len(output_sheets) == 1:
            os.rename(output_sheets[0], output_pdf)
        else:
            merge_cmd = [
                "gs", "-dBATCH", "-dNOPAUSE", "-q",
                "-sDEVICE=pdfwrite"
            ] + GS_BW_COMPRESS + [f"-sOutputFile={output_pdf}"] + output_sheets
            subprocess.run(merge_cmd, check=True, timeout=120)
            for s in output_sheets:
                try:
                    os.remove(s)
                except Exception:
                    pass

        # Clean up temp page images
        for p in page_imgs:
            try:
                os.remove(p)
            except Exception:
                pass

        print(f"✅ impose_nup: successfully created {len(output_sheets)}-sheet {n}-up PDF → {output_pdf}")
        return True

    except Exception as e:
        print(f"❌ impose_nup (GS+Pillow) failed: {e}")
        return False

def fast_compress_pdf(input_pdf, is_color=False, size_threshold_kb=512):
    """
    Bypassed: We now print PDFs directly to the printer to avoid slow Ghostscript compression on the Pi.
    """
    return input_pdf


def get_pdf_page_count(pdf_path):
    try:
        res = subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True, timeout=5)
        for line in res.stdout.splitlines():
            if line.startswith("Pages:"):
                return int(line.split(":")[1].strip())
    except Exception as e:
        print(f"⚠️ Failed to get page count for {pdf_path}: {e}")
    return 1


def pre_rasterize_pdf_for_color(pdf_path, is_color):
    """
    Pre-rasterize complex color PDFs using pdftoppm at 150 DPI to bypass
    expensive vector rendering filters on the Pi's CPU at print time.
    """
    if not is_color:
        return pdf_path
    try:
        import os
        import subprocess
        import glob

        size_mb = os.path.getsize(pdf_path) / (1024 * 1024)
        if size_mb < 1.0:  # Skip small PDFs
            return pdf_path
            
        pages = get_pdf_page_count(pdf_path)
        if pages > 5:
            print(f"📄 Color PDF has {pages} pages (exceeds threshold of 5). Skipping pre-rasterization to prevent overhead.")
            return pdf_path
            
        print(f"📄 Color PDF size is {size_mb:.2f}MB ({pages} page(s)). Pre-rasterizing via pdftoppm to speed up print...")
        prefix = os.path.splitext(pdf_path)[0] + "_raster"
        rasterized_pdf = os.path.splitext(pdf_path)[0] + "_rasterized.pdf"
        
        # Convert PDF to PNGs at 150 DPI
        cmd = ["pdftoppm", "-png", "-r", "150", pdf_path, prefix]
        subprocess.run(cmd, check=True, timeout=120)
        
        # Merge PNGs back to PDF using system python (which has Pillow compiled with JPEG support)
        py_cmd = [
            "/usr/bin/python3", "-c",
            "import glob, os; from PIL import Image; "
            f"png_files = sorted(glob.glob('{prefix}-*.png')); "
            "if not png_files: raise Exception('No PNGs generated'); "
            "images = [Image.open(pf).convert('RGB') for pf in png_files]; "
            f"images[0].save('{rasterized_pdf}', save_all=True, append_images=images[1:])"
        ]
        subprocess.run(py_cmd, check=True, timeout=120)
        
        if os.path.exists(rasterized_pdf):
            print(f"✅ Pre-rasterized PDF created: {rasterized_pdf}")
            
            # Clean up temp PNGs
            png_files = sorted(glob.glob(prefix + "-*.png"))
            for pf in png_files:
                try:
                    os.remove(pf)
                except:
                    pass
            # Remove original vector PDF to save disk space
            try:
                os.remove(pdf_path)
            except:
                pass
            return rasterized_pdf
            
    except Exception as e:
        print(f"⚠️ Pre-rasterization failed: {e}")
        # Clean up any leftover PNGs
        try:
            prefix = os.path.splitext(pdf_path)[0] + "_raster"
            png_files = glob.glob(prefix + "-*.png")
            for pf in png_files:
                os.remove(pf)
        except:
            pass
            
    return pdf_path


def is_printer_online(printer_name):
    """Check if the CUPS printer queue is enabled and accepting jobs, and physically connected via USB."""
    usb_id = PRINTER_USB_IDS.get(printer_name)
    if usb_id:
        try:
            lsusb_out = subprocess.run(["lsusb"], capture_output=True, text=True, timeout=5).stdout
            if usb_id not in lsusb_out:
                print(f"❌ Printer {printer_name} USB ID ({usb_id}) NOT found in lsusb! Printer is physically off/disconnected.")
                return False
        except Exception as e:
            print(f"⚠️ lsusb check failed: {e}")

    try:
        res = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True, timeout=2)
        output = res.stdout.lower()
        if "disabled" in output or "stopped" in output or "not accepting" in output:
            print(f"❌ Printer {printer_name} is OFFLINE/DISABLED")
            return False
        if res.returncode != 0 or "is idle" not in output and "now printing" not in output and "enabled" not in output:
            print(f"⚠️ Could not verify printer {printer_name} status: {res.stdout.strip()}")
            return False
        return True
    except Exception as e:
        print(f"⚠️ Printer status check failed: {e}")
        return False

def wait_for_cups_job(job_id, doc_ref, timeout=600):
    """
    Background thread: polls CUPS until 'job_id' disappears from the
    not-completed queue, then updates Firestore to completed.
    timeout: max seconds to wait (default 10 min).
    """
    import re
    start = time.time()
    print(f"⏳ [SYNC] Waiting for CUPS job {job_id} to physically finish printing...")
    try:
        while time.time() - start < timeout:
            # Check if the Firestore document status has changed to "failed" (timed out / cancelled / refunded)
            try:
                doc_snap = doc_ref.get()
                if doc_snap.exists:
                    doc_status = doc_snap.to_dict().get("status")
                    if doc_status == "failed":
                        print(f"⚠️ [SYNC] Job {doc_ref.id} was marked failed in Firestore (timeout/refunded). Cancelling CUPS job {job_id}...")
                        subprocess.run(["cancel", job_id], capture_output=True)
                        return
            except Exception as doc_err:
                print(f"⚠️ [SYNC] Failed to verify job status from Firestore: {doc_err}")

            try:
                res = subprocess.run(["lpstat", "-W", "not-completed"], capture_output=True, text=True, timeout=10)
                if job_id not in res.stdout:
                    # Job finished (printed or error)
                    # Check if it ended in an error by looking at completed jobs
                    res2 = subprocess.run(["lpstat", "-W", "completed"], capture_output=True, text=True, timeout=10)
                    job_ok = job_id in res2.stdout
                    if job_ok:
                        # Physical delay: give the printer time to actually eject the paper
                        # Brother laser: ~3s. Epson inkjet: ~15s.
                        doc_snap_latest = doc_ref.get()
                        doc_dict = doc_snap_latest.to_dict() or {} if doc_snap_latest.exists else {}
                        
                        # Double check that job wasn't failed/refunded while waiting
                        if doc_dict.get("status") == "failed":
                            print(f"⚠️ [SYNC] Job {doc_ref.id} was marked failed in Firestore. Cancelling CUPS job {job_id} and aborting completion.")
                            subprocess.run(["cancel", job_id], capture_output=True)
                            return

                        color_mode = doc_dict.get("colorMode", "monochrome")
                        is_inkjet = color_mode.lower() == "color"
                        paper_exit_delay = 15 if is_inkjet else 3
                        print(f"⏳ [SYNC] CUPS job {job_id} done in queue. Waiting {paper_exit_delay}s for physical paper ejection...")
                        time.sleep(paper_exit_delay)

                        # Final status check after paper ejection sleep
                        doc_snap_final = doc_ref.get()
                        if doc_snap_final.exists and doc_snap_final.to_dict().get("status") == "failed":
                            print(f"⚠️ [SYNC] Job {doc_ref.id} was marked failed during paper ejection sleep. Aborting completion.")
                            return

                        print(f"✅ [SYNC] CUPS job {job_id} completed physically. Marking Firestore completed.")
                        safe_update(doc_ref, {
                            "status": "completed",
                            "isPrinted": True,
                            "printerStatus": "Printed",
                            "printedAt": firestore.SERVER_TIMESTAMP
                        })
                    else:
                        print(f"❌ [SYNC] CUPS job {job_id} ended in error. Reporting failure for auto-refund.")
                        report_print_failure(doc_ref, "CUPS print error")
                    return
            except Exception as e:
                print(f"⚠️ [SYNC] lpstat poll error: {e}")
            time.sleep(5)
        # Timeout — mark failed
        print(f"❌ [SYNC] Timed out waiting for CUPS job {job_id}. Reporting failure for auto-refund.")
        report_print_failure(doc_ref, "Print timeout — no response from printer")
    finally:
        active_jobs.discard(doc_ref.id)
        print(f"ℹ️ [SYNC] Job {doc_ref.id} removed from active jobs list.")

def print_file(file_paths, copies=1, page_range=None, printer_name=BW_PRINTER_NAME,
               photo_layout=None, double_sided="single", is_blank_sheet=False,
               doc_ref=None):
    """
    Submits job to CUPS. If doc_ref is given, a background thread will poll CUPS
    for physical completion and update Firestore (status sync with actual print).
    """
    import re
    try:
        # ── Validate files ──
        total_size = sum(os.path.getsize(p) for p in file_paths)
        if total_size < 100:
            print("❌ Invalid file(s) size")
            return False

        for file_path in file_paths:
            if file_path.endswith('.pdf'):
                with open(file_path, 'rb') as f:
                    header = f.read(8)
                if not header.startswith(b'%PDF'):
                    print(f"❌ File not a valid PDF: {file_path}")
                    return False

        # ── Printer online guard ──
        if not is_printer_online(printer_name):
            print(f"❌ Aborting: printer {printer_name} is offline.")
            return False

        # ── Page range slicing ──
        if page_range:
            sliced_paths = []
            for p in file_paths:
                sliced = slice_pdf_pages(p, page_range)
                sliced_paths.append(sliced)
            file_paths = sliced_paths

        print(f"🖨️  Sending to CUPS [{printer_name}]: {[os.path.basename(f) for f in file_paths]} "
              f"({copies} copies, layout: {photo_layout or '1-up'}, sides: {double_sided})")

        is_color = (printer_name == COLOR_PRINTER_NAME)
        cmd = ["lp", "-d", printer_name, "-n", str(copies),
               "-o", "media=A4",
               "-o", "page-left=0", "-o", "page-right=0",
               "-o", "page-top=0", "-o", "page-bottom=0"]

        # fit-to-page is skipped for:
        #  - blank sheets / graph paper (print at exact size)
        #  - N-up imposed PDFs (geometry is pre-computed)
        skip_fit = is_blank_sheet or (photo_layout and str(photo_layout) in ["2", "4", "6", "9"])
        if not skip_fit:
            if is_color:
                # Epson: use print-scaling=fit to avoid right-shift from fit-to-page margin calc
                cmd.extend(["-o", "print-scaling=fit"])
            else:
                cmd.extend(["-o", "fit-to-page"])
        else:
            cmd.extend(["-o", "print-scaling=none"])

        # ── Print quality ──
        # B&W laser: Normal (300×300 dpi) is plenty and keeps spool data half the size of High (1200dpi).
        # Color inkjet: always Normal — High (1200dpi) massively slows Epson inkjet jobs.
        cmd.extend(["-o", "cupsPrintQuality=Normal"])

        # N-up safety guard (should never run — impose_nup pre-processes):
        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"]:
            print(f"⚠️ photo_layout={photo_layout} still set — N-up not pre-imposed. Using CUPS fallback.")
            cmd.extend(["-o", f"number-up={photo_layout}"])

        if double_sided == "double":
            # sides= and Duplex= are the standard CUPS options for duplex.
            # BRDuplex is NOT present in the Brother L2440DW PPD — omit it to avoid
            # potential conflicts. Duplex=DuplexNoTumble is the correct PPD option.
            cmd.extend(["-o", "sides=two-sided-long-edge", "-o", "Duplex=DuplexNoTumble"])
        else:
            cmd.extend(["-o", "sides=one-sided", "-o", "Duplex=None"])

        cmd.extend(file_paths)

        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
        lp_output = result.stdout.strip()
        print(f"CUPS accepted: {lp_output}")

        # Extract CUPS job ID
        match = re.search(r'request id is (\S+)', lp_output)
        if match and doc_ref:
            job_id = match.group(1)
            print(f"✅ CUPS job {job_id} queued. Spawning sync thread to track physical completion.")
            # Spawn background thread to wait for physical print and update Firestore
            t = threading.Thread(target=wait_for_cups_job, args=(job_id, doc_ref), daemon=True)
            t.start()
            # Return None to indicate 'async' — caller should NOT update Firestore immediately
            return None
        else:
            # No job ID extracted — fallback to immediate success
            print("⚠️ Could not extract CUPS job ID. Marking completed immediately.")
            return True

    except subprocess.CalledProcessError as e:
        print(f"❌ Print failed: {e.stderr.strip() if e.stderr else str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected print error: {e}")
        return False

def download_file(file_url, file_name):
    """Download file from Firebase Storage or a signed URL. Uses GCS SDK for fastest transfer."""
    try:
        safe_name = "".join([c for c in file_name if c.isalpha() or c.isdigit() or c in ' ._-']).rstrip()
        if not safe_name:
            safe_name = "document.pdf"
        local_path = os.path.join(TEMP_DIR, f"{int(time.time())}_{safe_name}")
        print(f"⬇️  Downloading: {file_name}")
        blob_path = None

        if file_url.startswith("gs://"):
            # gs://bucket-name/path
            blob_path = file_url.split(bucket.name + "/", 1)[1] if bucket.name in file_url else file_url[5:]
        elif "firebasestorage.googleapis.com" in file_url and "/o/" in file_url:
            path = file_url.split("/o/")[1].split("?")[0]
            blob_path = urllib.parse.unquote(path)
        elif "storage.googleapis.com/" in file_url:
            if f"/{bucket.name}/" in file_url:
                path = file_url.split(f"/{bucket.name}/")[1].split("?")[0]
                blob_path = urllib.parse.unquote(path)

        if blob_path:
            # Direct GCS SDK download — fastest, no HTTP overhead
            blob = bucket.blob(blob_path)
            blob.download_to_filename(local_path)
        else:
            # Fallback: HTTP download with large chunk size for speed
            response = requests.get(file_url, stream=True, timeout=180)
            response.raise_for_status()
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=1024 * 1024):  # 1 MB chunks
                    f.write(chunk)

        size_kb = os.path.getsize(local_path) / 1024
        print(f"✅ Downloaded {size_kb:.0f} KB → {local_path}")
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

def report_print_failure(doc_ref, reason):
    """
    Calls backend /kiosk/report-failure to trigger auto-refund.
    If the backend call fails, falls back to updating Firestore locally to 'failed'.
    """
    import os
    import requests
    job_id = doc_ref.id
    try:
        secret = os.environ.get("INTERNAL_WEBHOOK_SECRET", "mimo_secret_123")
        api_url = os.environ.get("BACKEND_URL", "https://api-upqxuj7evq-uc.a.run.app")
        endpoint = f"{api_url.rstrip('/')}/kiosk/report-failure"
        print(f"📣 [AUTO-REFUND] Reporting print failure for job {job_id} to backend: {reason}")
        res = requests.post(endpoint, json={
            "jobId": job_id,
            "reason": reason,
            "secret": secret
        }, timeout=15)
        print(f"📣 [AUTO-REFUND] Backend response: {res.status_code} - {res.text}")
        if res.status_code == 200:
            return True
    except Exception as e:
        print(f"⚠️ [AUTO-REFUND] Failed to report failure to backend: {e}")
    
    print(f"⚠️ [AUTO-REFUND] Falling back to local Firestore failed status for job {job_id}")
    safe_update(doc_ref, {"status": "failed", "printerStatus": reason})
    return False


def process_job(doc_snapshot):
    async_spawned = False
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

    # ── Monochrome-only guard (e.g. CV-001 which has only B&W Brother) ──
    # If IS_MONOCHROME_ONLY is set, we always print on the B&W printer regardless of color mode.
    if IS_MONOCHROME_ONLY and is_color:
        print(f"ℹ️  IS_MONOCHROME_ONLY: downgrading color job {doc_id} to B&W on {BW_PRINTER_NAME}")
        is_color = False
        color_mode = "monochrome"

    # Dynamic Printer Selection
    target_printer = COLOR_PRINTER_NAME if is_color else BW_PRINTER_NAME

    try:
        # ── PARALLEL DOWNLOAD: fetch all files simultaneously ──────────────────
        # Each file is downloaded in its own thread so multi-file jobs are as fast
        # as a single-file job (limited only by the slowest individual download).
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _download_one(f):
            """Download one file entry and return (f_dict, local_path, error)."""
            f_url  = f.get("url")
            f_name = f.get("name", "document.pdf")
            path = download_file(f_url, f_name)
            if not path:
                return f, None, f"Failed to download {f_name}"
            # Pre-flight compression (currently a no-op, but keep the hook)
            if path.lower().endswith(".pdf"):
                path = fast_compress_pdf(path, is_color=is_color)
                path = pre_rasterize_pdf_for_color(path, is_color=is_color)
            return f, path, None

        # Run downloads in parallel — cap at 4 threads to avoid Pi memory pressure
        download_results = [None] * len(files)  # preserve file order
        with ThreadPoolExecutor(max_workers=min(4, len(files))) as pool:
            future_to_idx = {pool.submit(_download_one, f): i for i, f in enumerate(files)}
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                f_entry, l_path, err = future.result()
                if err:
                    # One file failed — abort the whole job
                    report_print_failure(doc_ref, err)
                    return
                download_results[idx] = (f_entry, l_path)
                local_paths.append(l_path)

        # ── Per-file processing (conversion, scaling) ──────────────────────────
        any_file_sliced = False
        for f_entry, l_path in download_results:
            f_final = l_path
            ext = os.path.splitext(l_path)[1].lower()
            
            if ext in [".jpg", ".jpeg", ".png", ".heic"]:
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
                    report_print_failure(doc_ref, f"LibreOffice failed for {f_entry.get('name', 'document')}")
                    return
            
            # Slice pages based on individual fileConfigs if available
            file_name_key = f_entry.get("name")
            file_config = print_options.get("fileConfigs", {}).get(file_name_key, {})
            f_page_selection = file_config.get("pageSelection") or file_config.get("pagesToPrint") or "all"
            f_page_range = None
            if f_page_selection == "custom":
                f_page_range = file_config.get("pageRange") or file_config.get("customPageRange")
            
            if f_page_range and f_final.lower().endswith(".pdf"):
                sliced = slice_pdf_pages(f_final, f_page_range)
                if sliced:
                    f_final = sliced
                    any_file_sliced = True
            
            final_paths.append(f_final)

        # Ensure all files are PDFs before merging
        pdf_paths = []
        for fp in final_paths:
            if fp.lower().endswith(('.jpg', '.jpeg', '.png', '.heic')):
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

        # Merge all PDF files into a single PDF if there are multiple documents
        if len(pdf_paths) > 1:
            merged_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_merged_all.pdf")
            try:
                compress_flags = GS_COLOR_COMPRESS if is_color else GS_BW_COMPRESS
                print(f"🔗 Merging {len(pdf_paths)} documents into a single PDF using Ghostscript...")
                subprocess.run(["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite"
                               ] + compress_flags + [f"-sOutputFile={merged_pdf}"] + pdf_paths, check=True, timeout=60)
                pdf_paths = [merged_pdf]
            except Exception as merge_err:
                print(f"❌ Failed to merge PDF files: {merge_err}")

        # ── N-up layout imposition ──
        was_imposed = False
        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"]:
            print(f"🖼️ N-up: generating {photo_layout}-per-page layout...")
            # Merge all PDFs into one before imposing
            if len(pdf_paths) > 1:
                merged_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_merged_layout.pdf")
                subprocess.run(
                    ["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite"
                    ] + (GS_COLOR_COMPRESS if is_color else GS_BW_COMPRESS) + [f"-sOutputFile={merged_pdf}"] + pdf_paths,
                    check=True, timeout=60
                )
            else:
                merged_pdf = pdf_paths[0]

            imposed_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_imposed_layout.pdf")

            try:
                success_nup = impose_nup(merged_pdf, imposed_pdf, photo_layout)
                if success_nup and os.path.exists(imposed_pdf):
                    final_paths = [imposed_pdf]
                    photo_layout = None  # Cleared — CUPS must NOT impose again
                    was_imposed = True
                    print(f"✅ N-up imposition succeeded: {imposed_pdf}")
                else:
                    raise Exception("impose_nup returned False")
            except Exception as jam_err:
                print(f"⚠️ N-up imposition failed, falling back to CUPS number-up: {jam_err}")
                try:
                    layout_num = int(photo_layout)
                    total_p = 1
                    try:
                        p_info = subprocess.run(["pdfinfo", merged_pdf], capture_output=True, text=True)
                        for line in p_info.stdout.split('\n'):
                            if "Pages:" in line:
                                try:
                                    total_p = int(line.split(":")[1].strip())
                                except:
                                    pass
                    except Exception as pdfinfo_err:
                        print(f"⚠️ pdfinfo failed ({pdfinfo_err}), assuming 1 page.")

                    if total_p == 1:
                        dup_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_dup_layout.pdf")
                        subprocess.run(
                            ["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite"
                            ] + (GS_COLOR_COMPRESS if is_color else GS_BW_COMPRESS) + [f"-sOutputFile={dup_pdf}"] + [merged_pdf] * layout_num,
                            check=True
                        )
                        final_paths = [dup_pdf]
                    else:
                        final_paths = [merged_pdf]
                    # Keep photo_layout set so CUPS uses number-up
                    was_imposed = True  # Prevent pdf_paths override below
                    print(f"✅ N-up fallback prepared (CUPS number-up will be used)")
                except Exception as fallback_err:
                    print(f"❌ N-up fallback failed: {fallback_err}")
                    raise Exception("Layout generation failed entirely.")

        # ── Ensure final_paths is in sync with pdf_paths only if N-up was NOT applied ──
        # was_imposed prevents the bug where photo_layout=None (cleared on success) causes
        # the check below to override final_paths with the un-imposed pdf_paths.
        if not was_imposed:
            final_paths = pdf_paths


        # ── Duplex: duplicate single-page PDFs to enable 2-sided printing with multiple copies ──
        # Brother duplex requires at least 2 pages per copy to pair front/back correctly.
        if double_sided == "double":
            total_pages = 0
            try:
                if len(final_paths) == 1:
                    pi_info = subprocess.run(["pdfinfo", final_paths[0]], capture_output=True, text=True, timeout=10)
                    for line in pi_info.stdout.split("\n"):
                        if "Pages:" in line:
                            total_pages = int(line.split(":")[1].strip())
            except Exception as e:
                print(f"⚠️ Failed to check pages for duplex: {e}")

            if total_pages == 1:
                # Single-page doc: duplicate 2x so each copy has page+back for 2-sided
                print(f"📄 Duplex: Duplicating single-page PDF 2× to pair front/back...")
                dup_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_dup_duplex.pdf")
                try:
                    subprocess.run(
                        ["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite"
                        ] + (GS_COLOR_COMPRESS if is_color else GS_BW_COMPRESS) + [f"-sOutputFile={dup_pdf}"] + [final_paths[0]] * 2,
                        check=True, timeout=60
                    )
                    if os.path.exists(dup_pdf):
                        final_paths = [dup_pdf]
                        # copies stays as-is -> CUPS sends N copies of the 2-page PDF = N duplex sheets
                        print(f"✅ Duplex duplication done: {dup_pdf} (CUPS will send {copies} copies)")
                except Exception as dup_err:
                    print(f"❌ Failed to duplicate for duplex: {dup_err}")
            elif total_pages > 1 and copies > 1:
                # Multi-page doc: lp -n <copies> handles it correctly
                print(f"📄 Duplex multi-page ({total_pages} pages, {copies} copies) — sending as-is to CUPS.")

        # ── Color PDF Normalization ──
        # Explicitly set MediaBox to exactly A4 (595x842) for Epson L3250
        if is_color:
            normalized_paths = []
            for fp in final_paths:
                if fp.lower().endswith(".pdf"):
                    norm_pdf = os.path.join(TEMP_DIR, f"{int(time.time())}_color_norm.pdf")
                    try:
                        print(f"📄 Normalizing color PDF to A4: {fp} -> {norm_pdf}")
                        subprocess.run(
                            ["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite",
                             "-dFIXEDMEDIA", "-dDEVICEWIDTHPOINTS=595", "-dDEVICEHEIGHTPOINTS=842",
                             "-dPDFFitPage"
                            ] + GS_COLOR_COMPRESS + [f"-sOutputFile={norm_pdf}", fp],
                            check=True, timeout=60
                        )
                        if os.path.exists(norm_pdf):
                            normalized_paths.append(norm_pdf)
                        else:
                            normalized_paths.append(fp)
                    except Exception as e:
                        print(f"⚠️ Color normalization failed for {fp}: {e}")
                        normalized_paths.append(fp)
                else:
                    normalized_paths.append(fp)
            final_paths = normalized_paths

        # ── Submit to CUPS ──
        # Pass doc_ref so print_file can spawn the background sync thread
        async_spawned = False
        result = print_file(final_paths, copies, None if any_file_sliced else page_range, target_printer, photo_layout, double_sided, is_blank_sheet, doc_ref=doc_ref)

        if result is None:
            # Async path: background thread (wait_for_cups_job) will update Firestore when done.
            async_spawned = True
            print(f"⏳ Job {doc_id} submitted. Firestore will be updated after physical print completes.")
        elif result is True:
            # Sync fallback (no job ID extracted): mark completed now
            doc_ref.update({
                "status": "completed",
                "isPrinted": True,
                "printerStatus": "Printed",
                "printedAt": firestore.SERVER_TIMESTAMP
            })
            print(f"🎉 Job {doc_id} marked as completed (sync mode).")
        else:
            report_print_failure(doc_ref, "CUPS error on Pi")

            
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        report_print_failure(doc_ref, f"Pi processing error: {str(e)[:50]}")

    finally:
        try:
            for lp in local_paths:
                if lp and os.path.exists(lp): os.remove(lp)
            for fp in final_paths:
                if fp and fp not in local_paths and os.path.exists(fp): os.remove(fp)
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")
        finally:
            if not async_spawned:
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
            status_bw = "Idle" if is_printer_online(BW_PRINTER_NAME) else "Paused/Error"
            status_color = "Idle" if is_printer_online(COLOR_PRINTER_NAME) else "Paused/Error"
                
            db.collection("system_status").document(KIOSK_ID).set({
                "lastSeen": firestore.SERVER_TIMESTAMP,
                "printerStatus": f"B&W: {status_bw} | Color: {status_color}"
            }, merge=True)
        except Exception as e:
            print(f"⚠️ Heartbeat failed: {e}")
        time.sleep(30)

def reset_printer_usb(printer_name):
    usb_id = PRINTER_USB_IDS.get(printer_name)
    if not usb_id:
        # Fallback: scan lsusb dynamically to find any Brother or Epson printer
        try:
            lsusb_out = subprocess.run(["lsusb"], capture_output=True, text=True).stdout
            for line in lsusb_out.split("\n"):
                if "Brother" in line and "Brother" in printer_name:
                    parts = line.split("ID ")
                    if len(parts) > 1:
                        usb_id = parts[1].split()[0]
                        break
                elif "Epson" in line and "Epson" in printer_name:
                    parts = line.split("ID ")
                    if len(parts) > 1:
                        usb_id = parts[1].split()[0]
                        break
        except Exception as e:
            print(f"⚠️ Dynamic USB scan failed: {e}")

    if usb_id:
        print(f"🔌 Waking up printer {printer_name} via hardware USB reset ({usb_id})...")
        # Run usbreset with piped password
        res = subprocess.run(f"echo 'printpi' | sudo -S usbreset {usb_id}", shell=True, capture_output=True, text=True)
        print(f"USB reset output: {res.stdout.strip()} | Error: {res.stderr.strip()}")
        return True
    else:
        print(f"⚠️ No USB ID found for printer {printer_name}")
        return False

def resume_printer_jobs(printer_name):
    try:
        res = subprocess.run(["lpstat", "-o"], capture_output=True, text=True)
        for line in res.stdout.splitlines():
            if line.startswith(printer_name + "-"):
                parts = line.split()
                if parts:
                    job_id = parts[0]
                    print(f"🔓 Watchdog: Resuming job {job_id} on {printer_name}...")
                    subprocess.run(["lp", "-i", job_id, "-H", "resume"], capture_output=True)
    except Exception as e:
        print(f"⚠️ Failed to resume jobs for {printer_name}: {e}")


def watchdog_loop():
    stuck_cycles = {BW_PRINTER_NAME: 0, COLOR_PRINTER_NAME: 0}
    counter = 0
    while True:
        try:
            # 1. Run CUPS and printer checks every 60 seconds (every 6 iterations of 10s sleep)
            if counter % 6 == 0:
                printer_active = {}
                for printer in [BW_PRINTER_NAME, COLOR_PRINTER_NAME]:
                    # Only re-enable if the printer is currently disabled
                    status_res = subprocess.run(["lpstat", "-p", printer], capture_output=True, text=True)
                    status_out = status_res.stdout.lower()
                    if "disabled" in status_out:
                        print(f"⚠️ Watchdog: {printer} is disabled — re-enabling...")
                        subprocess.run(f"echo 'printpi' | sudo -S cupsenable {printer}", shell=True, capture_output=True)
                        resume_printer_jobs(printer)
                    
                    # Check if printer is currently printing
                    printer_active[printer] = "printing" in status_out

                result = subprocess.run(["lpstat", "-W", "not-completed"], capture_output=True, text=True)

                for printer in [BW_PRINTER_NAME, COLOR_PRINTER_NAME]:
                    if printer in result.stdout:
                        if printer_active.get(printer, False):
                            stuck_cycles[printer] = 0
                        else:
                            stuck_cycles[printer] += 1
                            print(f"⚠️ Watchdog: Stuck job detected on {printer} (Cycle {stuck_cycles[printer]} - Printer Idle but Job in Queue)")

                            if stuck_cycles[printer] >= 5: # 5 minutes threshold
                                print(f"🔧 Watchdog: Waking up sleeping printer {printer}...")
                                reset_printer_usb(printer)
                                
                                # Ensure ipp-usb is stopped and disabled so direct USB works
                                if "Brother" in printer:
                                    print("Ensuring ipp-usb is stopped...")
                                    subprocess.run(f"echo 'printpi' | sudo -S systemctl stop ipp-usb", shell=True, capture_output=True)
                                    subprocess.run(f"echo 'printpi' | sudo -S systemctl disable ipp-usb", shell=True, capture_output=True)
                                
                                # Re-enable CUPS queue
                                subprocess.run(f"echo 'printpi' | sudo -S cupsenable {printer}", shell=True, capture_output=True)
                                resume_printer_jobs(printer)
                                stuck_cycles[printer] = 0
                    else:
                        stuck_cycles[printer] = 0
            
            # 2. Run Firestore polling every 10 seconds (every iteration)
            docs = db.collection('print_jobs').where(filter=FieldFilter('status', '==', 'printing')).where(filter=FieldFilter('kioskId', '==', KIOSK_ID)).stream(timeout=30)
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
        
        counter += 1
        time.sleep(10)


def ping_printer_raw(printer_name, payload):
    try:
        temp_file = os.path.join(TEMP_DIR, f"ping_{printer_name}_{int(time.time())}.bin")
        with open(temp_file, "wb") as f:
            f.write(payload)
        subprocess.run(["lp", "-d", printer_name, "-o", "raw", temp_file], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if os.path.exists(temp_file):
            os.remove(temp_file)
    except Exception as e:
        print(f"⚠️ Failed to ping printer {printer_name}: {e}")

def keep_warm_loop():
    # Wait 60 seconds after startup before first ping to allow systems to settle
    time.sleep(60)
    while True:
        try:
            requests.get("https://api-upqxuj7evq-uc.a.run.app/", timeout=10)
        except:
            pass

        # We no longer send raw print jobs to printers to prevent deep sleep,
        # as this can trigger unwanted blank/PJL page printouts on driverless 
        # printers (like Brother HL-L2440DW). Printer reachability is kept
        # active via lpstat checks in the watchdog and heartbeat loops.
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
