import firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud.firestore_v1.base_query import FieldFilter

import time
import subprocess
import os
import tempfile
import zipfile
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
PRE_FETCH_DIR = "/tmp/mimo_pre_fetch"
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

def ensure_work_dirs():
    os.makedirs(TEMP_DIR, exist_ok=True)
    os.makedirs(PRE_FETCH_DIR, exist_ok=True)

# ── Ghostscript compression presets ──
# /ebook  → downsample images to 150 DPI; great for B&W laser (small spool, fast USB transfer)
# /screen → 72 DPI (too low for print quality)
# /printer → 300 DPI (keeps full quality but no size reduction)
#
# NOTE: Epson L3250 PPD PLAIN_NORMAL is patched to 180x180 DPI (was 360x360 before July 15 CUPS
# update). CUPS gstoraster renders at the PPD HWResolution. Keeping color images at 180 DPI matches
# the PPD and keeps the CUPS raster stream to ~9 MB instead of 37.5 MB → fast USB transfer.
GS_BW_COMPRESS  = ["-dPDFSETTINGS=/ebook",  "-dCompatibilityLevel=1.4",
                   "-dEmbedAllFonts=true",   "-dSubsetFonts=true"]
GS_COLOR_COMPRESS = ["-dPDFSETTINGS=/ebook",
                     "-dColorImageDownsampleType=/Bicubic", "-dColorImageResolution=180",
                     "-dGrayImageDownsampleType=/Bicubic", "-dGrayImageResolution=180",
                     "-dCompatibilityLevel=1.4", "-dEmbedAllFonts=true", "-dSubsetFonts=true"]

# Firebase handles are created by init_firebase() at startup (see the __main__ block at the end of this file),
# so the module can be imported (e.g. by tests) without connecting to Firebase.
db = None
bucket = None

def init_firebase():
    global db, bucket
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

# ── Input validation (multi-file print reliability) ──
# Every input that can reach the merge/CUPS stage must pass these checks. A file that merely starts with
# "%PDF" is not accepted: pdfinfo must parse it, report a page count, and the file must not be truncated.
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".heic", ".webp", ".img", ".bmp", ".tiff", ".tif", ".gif", ".jfif")
OFFICE_EXTENSIONS = (".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".txt", ".rtf", ".csv", ".odt", ".ods", ".odp")
ZIP_OFFICE_EXTENSIONS = (".docx", ".pptx", ".xlsx", ".odt", ".ods", ".odp")
OLE_OFFICE_EXTENSIONS = (".doc", ".ppt", ".xls")
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
MIN_PDF_BYTES = 100
PDF_EOF_SCAN_BYTES = 2048
PDFINFO_TIMEOUT_SEC = 20
# pdfinfo stderr messages that mean the file had to be reconstructed (truncated / damaged structure)
PDF_DAMAGE_MARKERS = (
    "couldn't find trailer dictionary",
    "couldn't read xref table",
    "may not be a pdf file",
    "pdf file is damaged",
    "try to reconstruct",
)

def validate_pdf_strict(path):
    """Strictly validate a PDF. Returns (ok, page_count, reason); page_count is None when not ok.

    Unlike get_pdf_page_count(), a failure is never reported as "1 page": a missing file, a missing
    pdfinfo binary, a parse error, a truncated file or a zero page count all make the PDF invalid.
    """
    try:
        if not path or not os.path.isfile(path):
            return False, None, f"file missing: {path}"
        size = os.path.getsize(path)
        if size < MIN_PDF_BYTES:
            return False, None, f"file too small ({size} bytes): {os.path.basename(path)}"
        with open(path, "rb") as fh:
            fh.seek(max(0, size - PDF_EOF_SCAN_BYTES))
            if b"%%EOF" not in fh.read():
                return False, None, f"PDF is truncated (no %%EOF marker): {os.path.basename(path)}"
        try:
            res = subprocess.run(["pdfinfo", path], capture_output=True, text=True, timeout=PDFINFO_TIMEOUT_SEC)
        except FileNotFoundError:
            return False, None, "pdfinfo is not installed (poppler-utils required)"
        except subprocess.TimeoutExpired:
            return False, None, f"pdfinfo timed out on {os.path.basename(path)}"
        if res.returncode != 0:
            err = (res.stderr or "").strip().splitlines()
            return False, None, f"pdfinfo could not parse {os.path.basename(path)}: {err[-1] if err else 'exit ' + str(res.returncode)}"
        stderr_lower = (res.stderr or "").lower()
        for marker in PDF_DAMAGE_MARKERS:
            if marker in stderr_lower:
                return False, None, f"PDF is damaged ({marker}): {os.path.basename(path)}"
        pages = None
        for line in (res.stdout or "").splitlines():
            if line.startswith("Pages:"):
                try:
                    pages = int(line.split(":", 1)[1].strip())
                except ValueError:
                    pages = None
                break
        if pages is None:
            return False, None, f"pdfinfo reported no page count for {os.path.basename(path)}"
        if pages < 1:
            return False, None, f"PDF has no pages: {os.path.basename(path)}"
        return True, pages, "ok"
    except Exception as e:
        return False, None, f"PDF validation error: {e}"

def validate_input_file(path):
    """Validate a downloaded/cached input according to its type. Returns (ok, reason).

    PDFs (and files without a known image/Office extension, which are treated as PDFs) use validate_pdf_strict.
    Images must be readable by Pillow. Office files must be complete archives/documents; their converted PDF is
    validated again after conversion.
    """
    try:
        if not path or not os.path.isfile(path):
            return False, f"file missing: {path}"
        size = os.path.getsize(path)
        if size == 0:
            return False, f"file is empty: {os.path.basename(path)}"
        ext = os.path.splitext(path)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            from PIL import Image
            with Image.open(path) as img:
                img.verify()
            return True, "ok"
        if ext in ZIP_OFFICE_EXTENSIONS:
            if not zipfile.is_zipfile(path):
                return False, f"Office file is incomplete or corrupt: {os.path.basename(path)}"
            return True, "ok"
        if ext in OLE_OFFICE_EXTENSIONS:
            with open(path, "rb") as fh:
                if fh.read(8) != OLE_MAGIC:
                    return False, f"Office file is incomplete or corrupt: {os.path.basename(path)}"
            return True, "ok"
        if ext in OFFICE_EXTENSIONS:
            return True, "ok"  # .txt / .rtf / .csv: any non-empty content; the converted PDF is validated later
        ok, _pages, reason = validate_pdf_strict(path)
        return ok, reason
    except Exception as e:
        return False, f"input validation error for {os.path.basename(str(path))}: {e}"

def _safe_remove(path):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError as e:
        print(f"⚠️ Could not remove {path}: {e}")

MIMETYPE_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/heic": ".heic", "image/gif": ".gif", "image/bmp": ".bmp", "image/tiff": ".tiff",
}

def effective_file_name(f):
    """File name used for download/cache/processing of one files[] entry.

    Keeps the uploaded name. Only when the name has no recognised extension and the entry's mimetype is known
    (e.g. an image uploaded without an extension) is the matching extension appended, so the file takes the
    correct processing branch instead of being validated as a PDF.
    """
    name = (f.get("name") if isinstance(f, dict) else None) or "document.pdf"
    ext = os.path.splitext(name)[1].lower()
    if ext == ".pdf" or ext in IMAGE_EXTENSIONS or ext in OFFICE_EXTENSIONS:
        return name
    mime_ext = MIMETYPE_EXTENSIONS.get(str(f.get("type") or "").lower().split(";")[0].strip())
    return name + mime_ext if mime_ext else name

def prefetch_cache_path(doc_id, f_idx, f_name):
    """Cache identity for one file entry of one job: <docId>_<idx><ext> (shared by prefetch and process_job)."""
    ext = os.path.splitext(f_name or "")[1].lower() or ".pdf"
    return os.path.join(PRE_FETCH_DIR, f"{doc_id}_{f_idx}{ext}")

def convert_to_pdf(input_path):
    try:
        print(f"⏳ Converting {input_path} to PDF via LibreOffice...")
        subprocess.run([
            "libreoffice", "--headless", "--nologo", "--nodefault", "--nofirststartwizard", "--convert-to", "pdf",
            "--outdir", TEMP_DIR, input_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        
        base_name = os.path.splitext(os.path.basename(input_path))[0] + ".pdf"
        outdir_pdf_path = os.path.join(TEMP_DIR, base_name)
        same_dir_pdf_path = os.path.splitext(input_path)[0] + ".pdf"
        
        if os.path.exists(outdir_pdf_path):
            print(f"✅ Conversion successful: {outdir_pdf_path}")
            return outdir_pdf_path
        elif os.path.exists(same_dir_pdf_path):
            print(f"✅ Conversion successful: {same_dir_pdf_path}")
            return same_dir_pdf_path
        else:
            raise Exception(f"PDF file not found after conversion (checked {outdir_pdf_path} and {same_dir_pdf_path})")
    except Exception as e:
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
    Pre-rasterize ALL color PDFs using pdftoppm at 180 DPI and JPEG compression.

    WHY 180 DPI:
      The Epson L3250 PPD PLAIN_NORMAL mode is patched to HWResolution[180 180].
      CUPS gstoraster renders at the PPD HWResolution. A PNG-embedded PDF at 180 DPI
      gives CUPS gstoraster almost nothing to do — it just decompresses JPEG and streams
      the pixels at the target DPI. This drops the USB payload from 37.5 MB to ~2.3 MB.

    WHY JPEG:
      Pillow's PDF save with JPEG reduces each A4 page at 180 DPI from ~7 MB (uncompressed)
      to ~150-300 KB, resulting in a PDF CUPS can process in seconds instead of minutes.
    """
    if not is_color:
        return pdf_path
    try:
        import os
        import subprocess
        import glob

        pages = get_pdf_page_count(pdf_path)
        if pages > 10:
            print(f"📄 Color PDF has {pages} pages (exceeds threshold of 10). Skipping pre-rasterization.")
            return pdf_path

        size_mb = os.path.getsize(pdf_path) / (1024 * 1024)
        print(f"📄 Pre-rasterizing color PDF ({size_mb:.2f}MB, {pages}p) at 180 DPI with JPEG compression...")
        prefix = os.path.splitext(pdf_path)[0] + "_raster"
        rasterized_pdf = os.path.splitext(pdf_path)[0] + "_rasterized.pdf"

        # Convert PDF pages to JPEGs at 180 DPI (much smaller than PNGs)
        cmd = ["pdftoppm", "-jpeg", "-r", "180", "-jpegopt", "quality=88", pdf_path, prefix]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            # Fallback: try PNG if JPEG flag not supported
            print(f"⚠️ pdftoppm JPEG failed, trying PNG fallback...")
            cmd = ["pdftoppm", "-png", "-r", "180", pdf_path, prefix]
            subprocess.run(cmd, check=True, timeout=120)

        # Find all output images (jpgs or pngs)
        img_files = sorted(glob.glob(prefix + "-*.jpg") + glob.glob(prefix + "-*.jpeg") + glob.glob(prefix + "-*.png"))
        if not img_files:
            print(f"⚠️ Pre-rasterization produced no images — skipping.")
            return pdf_path

        # Merge images back to a JPEG-compressed PDF using Pillow.
        # IMPORTANT: We write a temp script file instead of a one-liner because glob
        # patterns with '*' inside subprocess -c arguments cause SyntaxError on the Pi.
        merge_script = f"""
import glob, os
from PIL import Image
img_files = sorted(
    glob.glob({repr(prefix + '-*.jpg')}) +
    glob.glob({repr(prefix + '-*.jpeg')}) +
    glob.glob({repr(prefix + '-*.png')})
)
if not img_files:
    raise Exception('No images found after pdftoppm')
images = [Image.open(f).convert('RGB') for f in img_files]
images[0].save({repr(rasterized_pdf)}, save_all=True, append_images=images[1:], format='PDF', resolution=180.0)
print(f'Merged {{len(images)}} image(s) into PDF: {rasterized_pdf}')
"""
        merge_script_path = pdf_path + "_merge.py"
        with open(merge_script_path, "w") as f:
            f.write(merge_script)
        subprocess.run(["/usr/bin/python3", merge_script_path], check=True, timeout=120)
        try:
            os.remove(merge_script_path)
        except:
            pass

        if os.path.exists(rasterized_pdf) and os.path.getsize(rasterized_pdf) > 1000:
            new_size_mb = os.path.getsize(rasterized_pdf) / (1024 * 1024)
            print(f"✅ Pre-rasterized: {size_mb:.2f}MB → {new_size_mb:.2f}MB at 180 DPI ({rasterized_pdf})")
            # Clean up temp images
            for pf in img_files:
                try: os.remove(pf)
                except: pass
            # Remove original vector PDF to save disk space
            try: os.remove(pdf_path)
            except: pass
            return rasterized_pdf
        else:
            print(f"⚠️ Pre-rasterized file too small or missing — using original.")

    except Exception as e:
        print(f"⚠️ Pre-rasterization failed: {e}")
        # Clean up any leftover images
        try:
            prefix = os.path.splitext(pdf_path)[0] + "_raster"
            for pf in glob.glob(prefix + "-*"):
                try: os.remove(pf)
                except: pass
        except:
            pass

    return pdf_path


def is_printer_online(printer_name):
    """Check if the CUPS printer queue is enabled, accepting jobs, physically connected via USB/network, and free of hardware errors (out-of-paper, jam, door-open)."""
    usb_id = PRINTER_USB_IDS.get(printer_name)
    if usb_id:
        try:
            # Check if printer is configured as a network/wireless printer in CUPS (ipp://, http://, socket://, lpd://)
            lp_dev = subprocess.run(["lpstat", "-v", printer_name], capture_output=True, text=True, timeout=2).stdout.lower()
            is_network = any(proto in lp_dev for proto in ["ipp://", "http://", "https://", "socket://", "lpd://"])
            if not is_network:
                lsusb_out = subprocess.run(["lsusb"], capture_output=True, text=True, timeout=5).stdout
                if usb_id not in lsusb_out:
                    print(f"❌ Printer {printer_name} USB ID ({usb_id}) NOT found in lsusb! Printer is physically off/disconnected.")
                    return False, f"Printer {printer_name} is physically off or disconnected"
            else:
                print(f"ℹ️ Printer {printer_name} is configured as a network/wireless IPP printer. Skipping lsusb check.")
        except Exception as e:
            print(f"⚠️ lsusb check failed: {e}")

    try:
        # Check lpstat -p (without -l) for LIVE printer status & active hardware error states.
        # Note: Do NOT use -l because lpstat -l -p prints static PPD capability strings like 'Alerts: media-empty-error'.
        res_p = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True, timeout=3)
        p_out = res_p.stdout.lower()

        # Parse live error states from lpstat -p output
        if "media-empty" in p_out or "out-of-paper" in p_out or "out of paper" in p_out:
            print(f"❌ Printer {printer_name} reported LIVE OUT OF PAPER (media-empty-error) in CUPS!")
            return False, f"Printer {printer_name} is out of paper. Please add paper to the tray."

        if "media-jam" in p_out or "paper-jam" in p_out:
            print(f"❌ Printer {printer_name} reported LIVE PAPER JAM (media-jam-error) in CUPS!")
            return False, f"Printer {printer_name} has a paper jam. Please clear paper jam."

        if "door-open" in p_out or "cover-open" in p_out:
            print(f"❌ Printer {printer_name} reported LIVE DOOR OPEN in CUPS!")
            return False, f"Printer {printer_name} cover/door is open."

        if "disabled" in p_out or "stopped" in p_out or "not accepting" in p_out:
            print(f"⚠️ Printer {printer_name} is OFFLINE/DISABLED in CUPS. Attempting automatic queue healing...")
            try:
                subprocess.run(["sudo", "-S", "cupsenable", printer_name], input="printpi\n", text=True, capture_output=True, timeout=5)
                subprocess.run(["sudo", "-S", "cupsaccept", printer_name], input="printpi\n", text=True, capture_output=True, timeout=5)
                subprocess.run(["cupsenable", printer_name], capture_output=True, timeout=5)
                subprocess.run(["cupsaccept", printer_name], capture_output=True, timeout=5)
                time.sleep(1)
                res2 = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True, timeout=2)
                if "idle" in res2.stdout.lower() or "enabled" in res2.stdout.lower() or "printing" in res2.stdout.lower():
                    print(f"✅ Automatically recovered CUPS printer queue {printer_name}!")
                    return True, "Online"
            except Exception as recover_err:
                print(f"⚠️ Auto-recovery failed: {recover_err}")
            print(f"❌ Printer {printer_name} remains OFFLINE/DISABLED")
            return False, f"Printer {printer_name} queue is disabled or offline"

        if res_p.returncode != 0 or ("is idle" not in p_out and "now printing" not in p_out and "enabled" not in p_out):
            print(f"⚠️ Could not verify printer {printer_name} status: {res_p.stdout.strip()}")
            return False, f"Printer {printer_name} status check failed"

        return True, "Online"
    except Exception as e:
        print(f"⚠️ Printer status check failed: {e}")
        return False, f"Printer status check error: {e}"
# ================= PRINTER SELF-REPORT (PJL over USB) =================
# CUPS reports a job "completed" once the data has been handed to the printer; it cannot see paper. The Brother
# lasers answer PJL status queries on USB interface 0 (bidirectional), so the listener reads their lifetime page
# counter before and after a job and only reports "Printed" when the sheets really went through. The same reply
# carries the front-panel message, which exposes toner/drum warnings. CUPS holds the device only while a job is
# being sent, so queries run between jobs; if the device is busy or unreadable the check is skipped ("unknown").
PJL_UEL = b"\x1b%-12345X"
PJL_QUERY = PJL_UEL + b"@PJL\r\n@PJL INFO STATUS\r\n@PJL INFO PAGECOUNT\r\n" + PJL_UEL
PJL_IFACE, PJL_EP_OUT, PJL_EP_IN = 0, 0x01, 0x82
_pjl_lock = threading.Lock()
# One B&W job at a time between "read counter" and "verified", so two jobs' sheets are never mixed up.
_sheet_check_locks = {}
# Latest supply state per printer ("ok" | "low" | "empty"), refreshed by the heartbeat and before each B&W job.
printer_supply_state = {}
HARDWARE_PRINTER_ID = {"CV-001": "CV-001", "SV-002": "SV-002-BW"}
# Kill switch: set SHEET_CHECK=false in the service environment to go back to "completed when CUPS finishes".
SHEET_CHECK_ENABLED = os.environ.get("SHEET_CHECK", "true").lower() == "true"
SHEET_SLOT_WAIT_SEC = 120


def _pjl_exchange(usb_id, query=PJL_QUERY, timeout_s=6.0):
    """Send a PJL query to the USB printer `usb_id` ("vvvv:pppp") and return the reply text; raises on failure."""
    import ctypes
    import ctypes.util
    lib = ctypes.CDLL(ctypes.util.find_library("usb-1.0") or "libusb-1.0.so.0")
    lib.libusb_open_device_with_vid_pid.restype = ctypes.c_void_p
    lib.libusb_open_device_with_vid_pid.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_uint16]
    for name in ("libusb_kernel_driver_active", "libusb_detach_kernel_driver", "libusb_attach_kernel_driver",
                 "libusb_claim_interface", "libusb_release_interface"):
        getattr(lib, name).argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_set_interface_alt_setting.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
    lib.libusb_bulk_transfer.argtypes = [ctypes.c_void_p, ctypes.c_ubyte, ctypes.c_char_p, ctypes.c_int,
                                         ctypes.POINTER(ctypes.c_int), ctypes.c_uint]
    lib.libusb_close.argtypes = [ctypes.c_void_p]
    vid, pid = (int(x, 16) for x in usb_id.split(":"))
    ctx = ctypes.c_void_p()
    if lib.libusb_init(ctypes.byref(ctx)) != 0:
        raise RuntimeError("libusb_init failed")
    handle = lib.libusb_open_device_with_vid_pid(ctx, vid, pid)
    if not handle:
        lib.libusb_exit(ctx)
        raise RuntimeError("cannot open printer USB device (not present or no permission)")
    reattach = False
    try:
        if lib.libusb_kernel_driver_active(handle, PJL_IFACE) == 1:
            lib.libusb_detach_kernel_driver(handle, PJL_IFACE)
            reattach = True
        rc = lib.libusb_claim_interface(handle, PJL_IFACE)
        if rc != 0:
            raise RuntimeError(f"printer busy (claim {rc})")
        try:
            lib.libusb_set_interface_alt_setting(handle, PJL_IFACE, 0)
            n = ctypes.c_int()
            lib.libusb_bulk_transfer(handle, PJL_EP_OUT, query, len(query), ctypes.byref(n), 3000)
            buf, reply, deadline = ctypes.create_string_buffer(4096), b"", time.time() + timeout_s
            while time.time() < deadline:
                rc = lib.libusb_bulk_transfer(handle, PJL_EP_IN, buf, 4096, ctypes.byref(n), 700)
                if n.value:
                    reply += buf.raw[: n.value]
                if b"PAGECOUNT" in reply and reply.rstrip().endswith(b"\x0c"):
                    break
                if rc not in (0, -7):  # -7 = LIBUSB_ERROR_TIMEOUT, keep waiting
                    break
            return reply.decode("latin-1", "replace")
        finally:
            lib.libusb_release_interface(handle, PJL_IFACE)
    finally:
        if reattach:
            lib.libusb_attach_kernel_driver(handle, PJL_IFACE)
        lib.libusb_close(handle)
        lib.libusb_exit(ctx)


def parse_pjl_status(raw):
    """Pull the page counter, status code, panel message and online flag out of a PJL INFO reply."""
    import re
    raw = raw or ""
    def grab(pattern, cast=str):
        m = re.search(pattern, raw)
        return cast(m.group(1)) if m else None
    online = grab(r"ONLINE=(\w+)")
    return {
        "pagecount": grab(r"PAGECOUNT\s*\r?\n?\s*(?:PAGECOUNT=)?(\d+)", int),
        "status_code": grab(r"CODE=(\d+)", int),
        "display": grab(r"DISPLAY=\"([^\"]*)\""),
        "online": None if online is None else online.upper() == "TRUE",
    }


def classify_supply(display):
    """
    'empty' when the printer has stopped for toner/drum ("Replace Toner", "Replace Drum", "No Toner", "Drum Stop"),
    'low' for warnings it still prints through ("Toner Low", "Drum End Soon"), else 'ok'.
    """
    import re
    text = (display or "").lower()
    if not re.search(r"toner|drum|cartridge", text):
        return "ok"
    if re.search(r"\blow\b|soon|near", text):
        return "low"
    if re.search(r"replace|ended|empty|no toner|stop|install|error|\bout\b", text):
        return "empty"
    return "low"


def read_printer_status(printer_name):
    """PJL status of a USB Brother printer, or None if it is not a Brother, busy, or did not answer."""
    usb_id = PRINTER_USB_IDS.get(printer_name)
    if not usb_id or not usb_id.startswith("04f9:"):
        return None
    with _pjl_lock:
        try:
            info = parse_pjl_status(_pjl_exchange(usb_id))
        except Exception as e:
            print(f"ℹ️ [PJL] {printer_name} status not available: {e}")
            return None
    if info.get("pagecount") is None:
        return None
    printer_supply_state[printer_name] = classify_supply(info.get("display"))
    return info


def expected_min_sheets(page_count, copies, double_sided):
    """Fewest counter steps a correct job produces: sheets for duplex, pages otherwise."""
    pages = max(1, int(page_count or 1))
    per_copy = (pages + 1) // 2 if double_sided == "double" else pages
    return per_copy * max(1, int(copies or 1))


def verify_sheets_printed(printer_name, count_before, expected_min, max_wait=None, clock=time):
    """
    After CUPS has handed the job over, poll the page counter until enough sheets came out.
    Returns (verdict, printed): "ok" | "none" (nothing came out) | "short" (stopped early) | "unknown".
    """
    if count_before is None:
        return "unknown", None
    max_wait = max_wait or (45 + expected_min * 6)
    start = clock.time()
    last, last_change = None, start
    while clock.time() - start < max_wait:
        info = read_printer_status(printer_name)
        if info:
            count = info["pagecount"]
            if last is None or count != last:
                last, last_change = count, clock.time()
            if count - count_before >= expected_min:
                return "ok", count - count_before
            stalled = clock.time() - last_change
            if (count > count_before and stalled >= 25) or (count == count_before and stalled >= 60):
                break
        clock.sleep(2)
    if last is None:
        return "unknown", None
    printed = last - count_before
    return ("none" if printed <= 0 else "short"), printed


def sheet_check_lock(printer_name):
    return _sheet_check_locks.setdefault(printer_name, threading.Lock())


def begin_sheet_check(printer_name):
    """Take the printer's sheet-check slot and read the counter. Returns (held, count_before, info)."""
    if not SHEET_CHECK_ENABLED or not PRINTER_USB_IDS.get(printer_name, "").startswith("04f9:"):
        return False, None, None
    # Normally the previous job on this printer finishes its check within a minute or two. Never hold a customer
    # longer than that: past the wait, print without the check (the job is then marked printVerified: false).
    if not sheet_check_lock(printer_name).acquire(timeout=SHEET_SLOT_WAIT_SEC):
        print(f"⚠️ [SHEETS] Previous job on {printer_name} is still being checked; printing this one unverified.")
        return False, None, None
    info = read_printer_status(printer_name)
    return True, (info["pagecount"] if info else None), info


def is_color_queue(printer_name):
    """True only for a real colour queue. CV-001 sets both names to its Brother (IS_MONOCHROME_ONLY)."""
    return printer_name == COLOR_PRINTER_NAME and COLOR_PRINTER_NAME != BW_PRINTER_NAME


def end_sheet_check(printer_name):
    lock = _sheet_check_locks.get(printer_name)
    if lock and lock.locked():
        try:
            lock.release()
        except RuntimeError:
            pass


def publish_printer_health(printer_name, info):
    """Write the printer's panel message and supply state to hardware/printers (drives the backend email alerts)."""
    hw_id = HARDWARE_PRINTER_ID.get(KIOSK_ID)
    if not hw_id or db is None or not info:
        return
    supply = classify_supply(info.get("display"))
    try:
        db.collection("hardware").document("printers").set({hw_id: {
            "kioskId": KIOSK_ID,
            "printerName": printer_name,
            "panelMessage": info.get("display"),
            "pageCount": info.get("pagecount"),
            "supplyState": supply,
            # The backend emails when tonerLevel drops to <= 20. PJL gives no percentage on these models, so the
            # panel's own warning is mapped: ok -> 100, "Toner Low" -> 20, "Replace Toner/Drum" -> 0.
            "tonerLevel": {"ok": 100, "low": 20, "empty": 0}[supply],
            "healthCheckedAt": firestore.SERVER_TIMESTAMP,
        }}, merge=True)
    except Exception as e:
        print(f"⚠️ [PJL] Could not publish printer health: {e}")


def auto_heal_cups_queue(printer_name=BW_PRINTER_NAME, job_id=None):
    """
    Automatically clears stuck or errored jobs in CUPS and re-enables a paused/error print queue.
    This guarantees auto-error clearance so future print jobs are not blocked by a wedged queue.
    """
    try:
        print(f"🧹 [AUTO-CLEARANCE] Executing queue healing for printer: {printer_name}...")
        if job_id:
            print(f"🧹 [AUTO-CLEARANCE] Cancelling specific faulted CUPS job {job_id}...")
            subprocess.run(["cancel", job_id], capture_output=True, timeout=5)
        # Re-enable and accept jobs on the CUPS queue in case an error paused it
        try:
            subprocess.run(["sudo", "-S", "cupsenable", printer_name], input="printpi\n", text=True, capture_output=True, timeout=5)
            subprocess.run(["sudo", "-S", "cupsaccept", printer_name], input="printpi\n", text=True, capture_output=True, timeout=5)
            subprocess.run(["cupsenable", printer_name], capture_output=True, timeout=5)
            subprocess.run(["cupsaccept", printer_name], capture_output=True, timeout=5)
        except Exception as perm_err:
            print(f"⚠️ [AUTO-CLEARANCE] Queue command error: {perm_err}")
        print(f"✅ [AUTO-CLEARANCE] Successfully reset and enabled {printer_name} print queue.")
    except Exception as e:
        print(f"⚠️ [AUTO-CLEARANCE] Error during queue healing: {e}")

def wait_for_cups_job(job_id, doc_ref, timeout=1800, printer_name=BW_PRINTER_NAME, page_count=1, copies=1,
                      sheet_check=None):
    """
    Background thread: polls CUPS until 'job_id' disappears from the
    not-completed queue, then updates Firestore to completed.
    timeout: max seconds to wait (default 30 min).
    sheet_check: {"count_before", "expected_min"} from print_file for Brother lasers; when given, the job is only
    marked completed after the printer's own page counter shows the sheets came out. This thread owns the
    printer's sheet-check slot and releases it when it returns.
    """
    import re
    start = time.time()
    total_sheets = max(1, page_count * copies)
    is_color_printer = ("epson" in str(printer_name).lower() or "color" in str(printer_name).lower())
    print(f"⏳ [SYNC] Waiting for CUPS job {job_id} ({total_sheets} sheet(s)) to physically finish printing on {printer_name}...")
    try:
        while time.time() - start < timeout:
            # Check if the Firestore document status has changed to "failed" (timed out / cancelled / refunded)
            try:
                doc_snap = doc_ref.get()
                if doc_snap.exists:
                    doc_status = doc_snap.to_dict().get("status")
                    if doc_status == "failed":
                        print(f"⚠️ [SYNC] Job {doc_ref.id} was marked failed in Firestore (timeout/refunded). Cancelling CUPS job {job_id}...")
                        auto_heal_cups_queue(printer_name, job_id)
                        return
            except Exception as doc_err:
                print(f"⚠️ [SYNC] Failed to verify job status from Firestore: {doc_err}")

            try:
                # Check for hardware error alerts (out-of-paper, paper jam, door open) while job is queued
                chk_ok, chk_reason = is_printer_online(printer_name)
                if not chk_ok and "printing" not in chk_reason.lower():
                    print(f"❌ [SYNC] Printer hardware alert during printing: {chk_reason}. Aborting CUPS job {job_id}...")
                    auto_heal_cups_queue(printer_name, job_id)
                    report_print_failure(doc_ref, chk_reason)
                    return

                res = subprocess.run(["lpstat", "-W", "not-completed"], capture_output=True, text=True, timeout=10)
                if job_id not in res.stdout:
                    # Job finished (printed or error)
                    # Check if it ended in an error by looking at completed jobs
                    res2 = subprocess.run(["lpstat", "-W", "completed"], capture_output=True, text=True, timeout=10)
                    job_ok = job_id in res2.stdout
                    # Also treat as success if job is gone from both not-completed AND completed:
                    if not job_ok:
                        res3 = subprocess.run(["lpstat", "-W", "not-completed"], capture_output=True, text=True, timeout=10)
                        if job_id not in res3.stdout:
                            print(f"⚠️ [SYNC] CUPS job {job_id} not in completed history (rotated out), but also not in not-completed.")
                            job_ok = True

                    # Verify no silent filter crash occurred in /var/log/cups/error_log for this job
                    if job_ok:
                        try:
                            job_num = job_id.split("-")[-1]
                            # Use -F (fixed string) to match exact literal [Job N] without regex bracket interpretation
                            err_log_check = subprocess.run(
                                ["sudo", "grep", "-a", "-F", f"[Job {job_num}]", "/var/log/cups/error_log"],
                                capture_output=True, text=True, timeout=5
                            ).stdout
                            # Check specifically for driver filter crashes only (SetupJobAttrib = escpr crash, signal 13 = SIGPIPE crash)
                            # Note: "exited with no errors" is SUCCESS — do NOT flag it
                            if "SetupJobAttrib" in err_log_check or ("signal 13" in err_log_check and "no errors" not in err_log_check):
                                print(f"❌ [SYNC] Detected silent CUPS filter crash for job {job_id} in error_log! Failing job for auto-refund.")
                                job_ok = False
                            else:
                                print(f"✅ [SYNC] CUPS error_log verified clean for job {job_id} — no filter crashes detected.")
                        except Exception as filter_chk_err:
                            print(f"⚠️ [SYNC] Could not check error_log for filter crash: {filter_chk_err}")

                    if job_ok:
                        # Physical exit buffer: 4.0s for Color inkjet; 0.0s for B&W laser (already ejected when CUPS clears)
                        paper_exit_delay = 4.0 if is_color_printer else 0.0
                        if paper_exit_delay > 0:
                            print(f"⏳ [SYNC] CUPS confirmed job {job_id}. Waiting {paper_exit_delay}s for Color final sheet physical ejection...")
                            time.sleep(paper_exit_delay)

                        verified_fields = {}
                        if sheet_check:
                            expected = sheet_check["expected_min"]
                            verdict, printed = verify_sheets_printed(printer_name, sheet_check["count_before"], expected)
                            print(f"🔢 [SHEETS] {job_id}: {verdict} — page counter moved {printed} (needs at least {expected}).")
                            if verdict in ("none", "short"):
                                info = read_printer_status(printer_name)
                                panel = (info or {}).get("display") or "no message"
                                if info:
                                    publish_printer_health(printer_name, info)
                                if verdict == "none":
                                    reason = f"The printer did not print any page (printer shows: {panel})"
                                else:
                                    reason = f"The printer stopped after {printed} of {expected} sheets (printer shows: {panel})"
                                print(f"❌ [SHEETS] {reason}. Reporting failure for auto-refund.")
                                report_print_failure(doc_ref, reason + ". You will be refunded.")
                                return
                            verified_fields = {"printVerified": verdict == "ok", "sheetsVerified": printed}

                        print(f"✅ [SYNC] CUPS job {job_id} completed physically. Marking Firestore completed.")
                        safe_update(doc_ref, {
                            "status": "completed",
                            "isPrinted": True,
                            "printerStatus": "Printed",
                            "paperSheetsUsed": total_sheets,
                            "printedAt": firestore.SERVER_TIMESTAMP,
                            **verified_fields,
                        })
                    else:
                        print(f"❌ [SYNC] CUPS job {job_id} ended in error. Reporting failure for auto-refund.")
                        auto_heal_cups_queue(printer_name, job_id)
                        report_print_failure(doc_ref, "CUPS print error")
                    return
            except Exception as e:
                print(f"⚠️ [SYNC] lpstat poll error: {e}")
            time.sleep(0.5)
        # Timeout — mark failed
        print(f"❌ [SYNC] Timed out waiting for CUPS job {job_id}. Reporting failure for auto-refund.")
        auto_heal_cups_queue(printer_name, job_id)
        report_print_failure(doc_ref, "Print timeout — no response from printer")
    finally:
        if sheet_check:
            end_sheet_check(printer_name)
        active_jobs.discard(doc_ref.id)
        print(f"ℹ️ [SYNC] Job {doc_ref.id} removed from active jobs list.")

def print_file(file_paths, copies=1, page_range=None, printer_name=BW_PRINTER_NAME,
               photo_layout=None, double_sided="single", is_blank_sheet=False,
               doc_ref=None):
    """
    Submits job to CUPS. If doc_ref is given, a background thread will poll CUPS
    for physical completion and update Firestore (status sync with actual print).
    """
    import re, sys
    held_sheet_slot = False
    try:
        # ── Validate files ──
        total_size = sum(os.path.getsize(p) for p in file_paths)
        if total_size < 100:
            print("❌ Invalid file(s) size")
            if doc_ref:
                report_print_failure(doc_ref, f"Uploaded file is empty or too small ({total_size} bytes)")
            return False

        for file_path in file_paths:
            if file_path.endswith('.pdf'):
                with open(file_path, 'rb') as f:
                    header = f.read(8)
                if not header.startswith(b'%PDF'):
                    print(f"❌ File not a valid PDF: {file_path}")
                    if doc_ref:
                        report_print_failure(doc_ref, f"Uploaded file is not a valid PDF: {os.path.basename(file_path)}")
                    return False

        # ── Printer online guard ──
        online_ok, online_reason = is_printer_online(printer_name)
        if not online_ok:
            if os.environ.get("SIMULATE_DEV", "false").lower() == "true":
                print(f"⚠️ [DEV SIMULATION] Printer {printer_name} offline ({online_reason}). Simulating print job success over 6 seconds...")
                if doc_ref:
                    def simulate_job():
                        time.sleep(6)
                        doc_ref.update({
                            "status": "completed",
                            "isPrinted": True,
                            "printerStatus": "Printed",
                            "printedAt": firestore.SERVER_TIMESTAMP
                        })
                        print(f"✅ [DEV SIMULATION] Simulated completion for job {doc_ref.id}.")
                    t = threading.Thread(target=simulate_job, daemon=True)
                    t.start()
                    return None
                return True

            print(f"❌ Aborting: printer {printer_name} is offline ({online_reason}). Reporting failure for auto-refund.")
            # Cancel all queued jobs for this printer so they don't spool when printer comes back
            try:
                stale_res = subprocess.run(["lpstat", "-o"], capture_output=True, text=True)
                for stale_line in stale_res.stdout.splitlines():
                    if stale_line.startswith(printer_name + "-"):
                        stale_parts = stale_line.split()
                        if stale_parts:
                            stale_job_id = stale_parts[0]
                            print(f"🚫 Cancelling queued CUPS job {stale_job_id} (printer offline).")
                            subprocess.run(["cancel", stale_job_id], capture_output=True)
            except Exception as cancel_err:
                print(f"⚠️ Failed to cancel queued CUPS jobs: {cancel_err}")

            if doc_ref:
                report_print_failure(doc_ref, online_reason)
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

        is_color = is_color_queue(printer_name)
        cmd = ["lp", "-d", printer_name, "-n", str(copies),
               "-o", "media=A4"]

        if is_color:
            # Zero-margin overrides are specific to Epson inkjet color alignment
            cmd.extend([
                "-o", "page-left=0", "-o", "page-right=0",
                "-o", "page-top=0", "-o", "page-bottom=0"
            ])
        else:
            cmd.extend(["-o", "InputSlot=Main"])

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

        # ── Print quality & media type ──
        if is_color:
            # Epson L3250 PPD option for standard plain paper speed: PLAIN_NORMAL
            cmd.extend(["-o", "MediaType=PLAIN_NORMAL"])
        else:
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

        # ── Final pre-lp gate: every file handed to CUPS must be a strictly valid PDF with >= 1 page ──
        # No failure is reported here; the caller (process_job) reports it once when this returns False.
        for file_path in file_paths:
            gate_ok, gate_pages, gate_reason = validate_pdf_strict(file_path)
            if not gate_ok or not gate_pages or gate_pages < 1:
                print(f"❌ Final pre-print check failed, not sending to CUPS: {gate_reason}")
                return False

        # ── Sheet check (Brother lasers): read the page counter first, and never print into a toner/drum stop ──
        if doc_ref and not is_color:
            held_sheet_slot, count_before, pjl_info = begin_sheet_check(printer_name)
            if pjl_info and classify_supply(pjl_info.get("display")) == "empty":
                panel = pjl_info.get("display")
                print(f"❌ [SHEETS] {printer_name} shows '{panel}'. Not printing (it would come out blank).")
                publish_printer_health(printer_name, pjl_info)
                end_sheet_check(printer_name)
                held_sheet_slot = False
                report_print_failure(doc_ref, f"Printer needs new toner or drum ({panel}). You have not been charged for this print.")
                return False
            if held_sheet_slot:
                print(f"🔢 [SHEETS] {printer_name} page counter before printing: {count_before}")

        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
        lp_output = result.stdout.strip()
        print(f"CUPS accepted: {lp_output}")

        # Extract CUPS job ID
        match = re.search(r'request id is (\S+)', lp_output)
        if match and doc_ref:
            job_id = match.group(1)
            # Calculate dynamic timeout: 600s base + 360s per color page (or 30s per B&W page)
            page_count = sum(get_pdf_page_count(f) for f in file_paths if f.endswith(".pdf")) or 1
            cups_timeout = (600 + page_count * copies * (360 if is_color else 30))
            print(f"✅ CUPS job {job_id} queued. Spawning sync thread to track physical completion (timeout: {cups_timeout}s).")
            # Spawn background thread to wait for physical print and update Firestore
            sheet_check = None
            if held_sheet_slot:
                sheet_check = {"count_before": count_before,
                               "expected_min": expected_min_sheets(page_count, copies, double_sided)}
            t = threading.Thread(target=wait_for_cups_job,
                                 args=(job_id, doc_ref, cups_timeout, printer_name, page_count, copies, sheet_check),
                                 daemon=True)
            held_sheet_slot = False  # the tracking thread now owns (and releases) the slot
            t.start()
            # Return None to indicate 'async' — caller should NOT update Firestore immediately
            return None
        else:
            # No job ID extracted — fallback to immediate success
            if held_sheet_slot:
                end_sheet_check(printer_name)
                held_sheet_slot = False
            print("⚠️ Could not extract CUPS job ID. Marking completed immediately.")
            return True

    except (subprocess.CalledProcessError, Exception) as e:
        if held_sheet_slot:
            end_sheet_check(printer_name)
        if os.environ.get("SIMULATE_DEV", "false").lower() == "true":
            print(f"⚠️ [DEV SIMULATION] Print execution error ({e}). Simulating successful print job over 6 seconds...")
            if doc_ref:
                def simulate_job_err():
                    time.sleep(6)
                    doc_ref.update({
                        "status": "completed",
                        "isPrinted": True,
                        "printerStatus": "Printed",
                        "printedAt": firestore.SERVER_TIMESTAMP
                    })
                    print(f"✅ [DEV SIMULATION] Simulated completion for job {doc_ref.id}.")
                t = threading.Thread(target=simulate_job_err, daemon=True)
                t.start()
                return None
            return True
        print(f"❌ Print error: {e}")
        if doc_ref:
            report_print_failure(doc_ref, f"Print command execution error: {e}")
        return False

def download_file(file_url, file_name, dest_dir=None, temp_prefix=None):
    """Download file from Firebase Storage or a signed URL. Uses GCS SDK for fastest transfer.

    Every call writes to its own unique temporary file (tempfile.mkstemp), so concurrent downloads (parallel
    files of one job, prefetch threads, process_job) never share a path or inode, even for identical file
    names. The original name is kept as the suffix so the extension still selects the processing branch.
    Returns the local path, or None on failure (the partial file is removed).
    """
    local_path = None
    try:
        safe_name = "".join([c for c in (file_name or "") if c.isalpha() or c.isdigit() or c in ' ._-']).rstrip()
        if not safe_name:
            safe_name = "document.pdf"
        target_dir = dest_dir or TEMP_DIR
        os.makedirs(target_dir, exist_ok=True)
        fd, local_path = tempfile.mkstemp(prefix=temp_prefix or f"{int(time.time())}_", suffix=f"_{safe_name}", dir=target_dir)
        os.close(fd)
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
        _safe_remove(local_path)
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


GS_MERGE_TIMEOUT_SEC = 60  # unchanged merge timeout

def new_temp_pdf_path(label):
    """Unique temporary PDF path in TEMP_DIR (never in the prefetch cache), e.g. <ts>_<random>_merged_all.pdf."""
    os.makedirs(TEMP_DIR, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix=f"{int(time.time())}_", suffix=f"_{label}.pdf", dir=TEMP_DIR)
    os.close(fd)
    return path

def merge_pdfs_strict(input_paths, output_pdf, compress_flags):
    """Merge validated PDFs with Ghostscript and fail closed. Returns (ok, merged_page_count, reason).

    Every input must pass validate_pdf_strict() first. Any Ghostscript problem (non-zero exit, timeout, missing
    executable, other execution error), a missing/invalid output, or a merged page count that differs from the sum
    of the input page counts is a failure. On failure the output file is removed; there is no fallback to the
    unmerged inputs.
    """
    input_page_counts = []
    for p in input_paths:
        ok, pages, reason = validate_pdf_strict(p)
        if not ok:
            return False, None, f"merge input invalid: {reason}"
        input_page_counts.append(pages)
    expected_pages = sum(input_page_counts)

    started = time.time()
    try:
        subprocess.run(["gs", "-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite"
                       ] + compress_flags + [f"-sOutputFile={output_pdf}"] + list(input_paths),
                       check=True, timeout=GS_MERGE_TIMEOUT_SEC)
    except FileNotFoundError:
        _safe_remove(output_pdf)
        return False, None, "Ghostscript (gs) is not installed"
    except subprocess.TimeoutExpired:
        _safe_remove(output_pdf)
        return False, None, f"Ghostscript merge timed out after {GS_MERGE_TIMEOUT_SEC}s"
    except subprocess.CalledProcessError as e:
        _safe_remove(output_pdf)
        return False, None, f"Ghostscript merge failed (exit code {e.returncode})"
    except Exception as e:
        _safe_remove(output_pdf)
        return False, None, f"Ghostscript merge error: {e}"
    elapsed = time.time() - started

    ok, merged_pages, reason = validate_pdf_strict(output_pdf)
    if not ok:
        _safe_remove(output_pdf)
        return False, None, f"merged output invalid: {reason}"
    if merged_pages != expected_pages:
        _safe_remove(output_pdf)
        return False, None, f"merged page count {merged_pages} != {expected_pages} (sum of {len(input_paths)} inputs)"
    print(f"⏱️ Ghostscript merged {len(input_paths)} PDFs ({merged_pages} pages) in {elapsed:.1f}s")
    return True, merged_pages, "ok"

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
    if str(page_selection).lower() == "custom":
        page_range = print_options.get("pageRange") or print_options.get("customPageRange")
    elif str(page_selection).lower() == "all":
        page_range = None

    files = doc.get("files")
    if not files:
        files = [{"url": file_url, "name": file_name, "type": doc.get("mimetype")}]
    # The job's own file list is the only source of the expected count. Exactly this many inputs must be
    # acquired, processed and validated; a missing, corrupt or substituted input fails the whole job.
    expected_count = len(files) if isinstance(files, list) else 0

    local_paths = []
    final_paths = []
    artifact_paths = []  # per-file intermediates created during processing (removed in finally)

    # ── Monochrome-only guard (e.g. CV-001 which has only B&W Brother) ──
    # If IS_MONOCHROME_ONLY is set, we always print on the B&W printer regardless of color mode.
    if IS_MONOCHROME_ONLY and is_color:
        print(f"ℹ️  IS_MONOCHROME_ONLY: downgrading color job {doc_id} to B&W on {BW_PRINTER_NAME}")
        is_color = False
        color_mode = "monochrome"

    # Dynamic Printer Selection
    target_printer = COLOR_PRINTER_NAME if is_color else BW_PRINTER_NAME

    try:
        if expected_count < 1:
            report_print_failure(doc_ref, "Print job has no valid file list")
            return

        # ── PARALLEL DOWNLOAD: fetch all files simultaneously ──────────────────
        # Each file is downloaded in its own thread so multi-file jobs are as fast
        # as a single-file job (limited only by the slowest individual download).
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _download_one(f_tuple):
            """Acquire one file entry (validated cache hit or validated fresh download).

            Returns (f_dict, local_path, error). A cache entry is used only if it passes strict validation;
            an invalid cache entry is purged and the file is downloaded again. An invalid fresh download is
            an error: the invalid cache is never used as a fallback.
            """
            f_idx, f = f_tuple
            if not isinstance(f, dict):
                return f, None, f"Invalid file entry #{f_idx + 1}"
            f_url = f.get("url")
            f_name = effective_file_name(f)
            if not f_url:
                return f, None, f"Missing download URL for {f_name}"
            cache_path = prefetch_cache_path(doc_id, f_idx, f_name)
            path = None
            if os.path.exists(cache_path):
                cache_ok, cache_reason = validate_input_file(cache_path)
                if cache_ok:
                    print(f"⚡ [INSTANT PRINT] Job {doc_id} (file {f_idx+1}) found in pre-fetch edge cache! Using cached file (0s download delay).")
                    path = cache_path
                else:
                    print(f"⚠️ [CACHE INVALID] Cached file {cache_path} rejected ({cache_reason}). Purging and downloading again...")
                    _safe_remove(cache_path)
            if path is None:
                path = download_file(f_url, f_name)
                if not path:
                    return f, None, f"Failed to download {f_name}"
                fresh_ok, fresh_reason = validate_input_file(path)
                if not fresh_ok:
                    _safe_remove(path)
                    return f, None, f"Downloaded file is invalid: {fresh_reason}"
            # Pre-flight compression (currently a no-op, but keep the hook)
            if path.lower().endswith(".pdf"):
                path = fast_compress_pdf(path, is_color=is_color)
                path = pre_rasterize_pdf_for_color(path, is_color=is_color)
            return f, path, None

        # Run downloads in parallel — cap at 4 threads to avoid Pi memory pressure.
        # All downloads are collected (so every temporary file is tracked for cleanup) before a failure is reported.
        download_results = [None] * len(files)  # preserve file order
        first_error = None
        with ThreadPoolExecutor(max_workers=min(4, len(files))) as pool:
            future_to_idx = {pool.submit(_download_one, (i, f)): i for i, f in enumerate(files)}
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    f_entry, l_path, err = future.result()
                except Exception as dl_err:
                    f_entry, l_path, err = None, None, f"Download error: {dl_err}"
                if l_path:
                    local_paths.append(l_path)
                if err:
                    if first_error is None:
                        first_error = err
                    continue
                download_results[idx] = (f_entry, l_path)

        if first_error:
            # One file failed — abort the whole job
            report_print_failure(doc_ref, first_error)
            return

        acquired = [r for r in download_results if r is not None]
        if len(acquired) != expected_count:
            report_print_failure(doc_ref, f"Only {len(acquired)} of {expected_count} files could be downloaded")
            return
        if len({os.path.realpath(r[1]) for r in acquired}) != expected_count:
            report_print_failure(doc_ref, "Two job files resolved to the same local file")
            return

        # ── Per-file processing (conversion, scaling) ──────────────────────────
        # Any conversion failure fails the job: an unconverted raw input is never passed on.
        any_file_sliced = False
        for f_entry, l_path in download_results:
            f_final = l_path
            ext = os.path.splitext(l_path)[1].lower()
            entry_name = f_entry.get("name", "document")

            if ext in IMAGE_EXTENSIONS:
                if image_scaling == "fill":
                    pdf_path = process_image_fill(l_path, photo_layout, is_color)
                elif image_scaling == "custom":
                    pdf_path = process_image_custom(l_path, custom_scale, is_color)
                else:
                    # FIT mode: still convert to PDF so CUPS number-up works reliably
                    pdf_path = convert_image_to_pdf_fit(l_path, is_color)
                if not pdf_path:
                    report_print_failure(doc_ref, f"Image processing failed for {entry_name}")
                    return
                artifact_paths.append(pdf_path)
                f_final = pdf_path

            elif ext in OFFICE_EXTENSIONS:
                pdf_path = convert_to_pdf(l_path)
                if not pdf_path:
                    report_print_failure(doc_ref, f"LibreOffice failed for {entry_name}")
                    return
                artifact_paths.append(pdf_path)
                f_final = pdf_path

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
                    if sliced != f_final:
                        artifact_paths.append(sliced)
                    f_final = sliced
                    any_file_sliced = True

            final_paths.append(f_final)

        # ── Hand-off gate: exactly one strictly valid PDF per expected file ──
        pdf_paths = []
        validated_pages = 0
        for (f_entry, _l_path), fp in zip(download_results, final_paths):
            ok, pages, reason = validate_pdf_strict(fp)
            if not ok:
                report_print_failure(doc_ref, f"Processed file for {f_entry.get('name', 'document')} is not a valid PDF: {reason}")
                return
            pdf_paths.append(fp)
            validated_pages += pages
        if len(pdf_paths) != expected_count or len({os.path.realpath(p) for p in pdf_paths}) != expected_count:
            report_print_failure(doc_ref, f"Only {len(pdf_paths)} of {expected_count} files are ready to print")
            return
        print(f"✅ All {expected_count} file(s) of job {doc_id} validated ({validated_pages} page(s)).")

        # Merge all PDF files into a single PDF if there are multiple documents.
        # This is the only merge. It fails closed: any merge problem fails the job here, and the unmerged
        # inputs are never sent to CUPS instead.
        if len(pdf_paths) > 1:
            if len(pdf_paths) != expected_count:
                report_print_failure(doc_ref, f"Merge refused: {len(pdf_paths)} inputs for {expected_count} files")
                return
            merged_pdf = new_temp_pdf_path("merged_all")
            artifact_paths.append(merged_pdf)
            compress_flags = GS_COLOR_COMPRESS if is_color else GS_BW_COMPRESS
            print(f"🔗 Merging {len(pdf_paths)} documents into a single PDF using Ghostscript...")
            merge_ok, merged_pages, merge_reason = merge_pdfs_strict(pdf_paths, merged_pdf, compress_flags)
            if not merge_ok:
                print(f"❌ Failed to merge PDF files: {merge_reason}")
                report_print_failure(doc_ref, f"Could not merge the job's files: {merge_reason}")
                return
            pdf_paths = [merged_pdf]

        # ── N-up layout imposition ──
        was_imposed = False
        if photo_layout and str(photo_layout) in ["2", "4", "6", "9"]:
            print(f"🖼️ N-up: generating {photo_layout}-per-page layout...")
            # Multiple inputs were already merged (fail closed) above, so N-up always receives exactly one PDF.
            if len(pdf_paths) != 1:
                report_print_failure(doc_ref, "N-up layout requires a single merged PDF")
                return
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

        # ── Color PDF Pre-Rasterization ──
        # Convert normalized color PDFs to 180 DPI JPEG-compressed images embedded in PDF.
        # This bypasses the slow CUPS gstoraster 360 DPI re-rasterization step that was
        # introduced by the July 15 CUPS deb13u2 update. Without this, CUPS generates a
        # 37.5 MB uncompressed raster stream for every A4 color page → USB transfer takes 9+ min.
        # With pre-rasterization at 180 DPI + JPEG: payload drops to ~2.3 MB → under 60 sec total.
        if is_color:
            rasterized_paths = []
            for fp in final_paths:
                rasterized_paths.append(pre_rasterize_pdf_for_color(fp, is_color=True))
            final_paths = rasterized_paths

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
            for ap in artifact_paths:
                if ap and ap not in local_paths and ap not in final_paths and os.path.exists(ap): os.remove(ap)
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")
        finally:
            if not async_spawned:
                active_jobs.discard(doc_id)

_seen_first_snapshot = False


def on_snapshot(col_snapshot, changes, read_time):
    """See pi-listener/firebase_listener.py's on_snapshot for the full rationale: the first callback
    after (re)connecting delivers every already-matching job as 'ADDED', which without this guard fires
    them unattended the instant the Pi comes back online, not just genuinely new jobs."""
    global _seen_first_snapshot
    is_reconnect_snapshot = not _seen_first_snapshot
    _seen_first_snapshot = True

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
                if doc.id in active_jobs:
                    continue

                if is_reconnect_snapshot and change.type.name == 'ADDED':
                    started_at = data.get("printStartedAt") or data.get("createdAt") or data.get("updatedAt")
                    now = datetime.now(started_at.tzinfo) if started_at else datetime.now()
                    eligible, reason = is_eligible_for_auto_resume(doc.id, data, active_jobs, now)
                    if not eligible:
                        print(f"⚠️ Skipping job seen on reconnect: {doc.id} ({reason})")
                        continue
                    try:
                        doc.reference.update({"autoResumedAt": firestore.SERVER_TIMESTAMP})
                    except Exception as mark_err:
                        print(f"⚠️ Failed to mark auto-resume for {doc.id}, skipping to be safe: {mark_err}")
                        continue
                    print(f"\n🔔 Resuming job seen on reconnect: {doc.id} ({reason})")
                else:
                    print(f"\n🔔 New {data.get('colorMode', 'monochrome')} job detected: {doc.id}")

                active_jobs.add(doc.id)
                threading.Thread(target=process_job, args=(doc,), daemon=True).start()

PRINTER_HEALTH_INTERVAL_SEC = 600


def check_printer_health_when_idle():
    """Read the B&W printer's panel message and counter between jobs and publish it (toner/drum alerts)."""
    if active_jobs:
        return False
    queued = subprocess.run(["lpstat", "-o", BW_PRINTER_NAME], capture_output=True, text=True, timeout=5).stdout.strip()
    if queued:
        return False
    info = read_printer_status(BW_PRINTER_NAME)
    if not info:
        return False
    publish_printer_health(BW_PRINTER_NAME, info)
    supply = classify_supply(info.get("display"))
    if supply != "ok":
        print(f"⚠️ [PJL] {BW_PRINTER_NAME} shows '{info.get('display')}' (supply: {supply}).")
    return True


def heartbeat_loop():
    last_health = 0.0
    while True:
        try:
            bw_ok, _bw_reason = is_printer_online(BW_PRINTER_NAME)
            color_ok, _color_reason = is_printer_online(COLOR_PRINTER_NAME)
            status_bw = "Idle" if bw_ok else "Paused/Error"
            status_color = "Idle" if color_ok else "Paused/Error"

            db.collection("system_status").document(KIOSK_ID).set({
                "lastSeen": firestore.SERVER_TIMESTAMP,
                "printerStatus": f"B&W: {status_bw} | Color: {status_color}"
            }, merge=True)
        except Exception as e:
            print(f"⚠️ Heartbeat failed: {e}")
        try:
            if time.time() - last_health >= PRINTER_HEALTH_INTERVAL_SEC and check_printer_health_when_idle():
                last_health = time.time()
        except Exception as e:
            print(f"⚠️ Printer health check failed: {e}")
        time.sleep(120)

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
        # Restart CUPS to immediately re-claim USB interface and prevent usbfs detach hangs
        subprocess.run(f"echo 'printpi' | sudo -S systemctl restart cups", shell=True, capture_output=True)
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


def cancel_stale_cups_jobs_for_printer(printer_name):
    """
    When the printer comes back online, check every CUPS job queued for it.
    If the corresponding Firestore print_job is already failed/refunded/completed,
    cancel the CUPS spool entry so it never reprints.
    Only jobs whose Firestore status is still 'printing' are resumed.
    This prevents a job that was auto-refunded (because printer was off) from
    printing again when the printer is switched back on.
    """
    try:
        res = subprocess.run(["lpstat", "-o"], capture_output=True, text=True)
        for line in res.stdout.splitlines():
            if line.startswith(printer_name + "-"):
                parts = line.split()
                if not parts:
                    continue
                cups_job_id = parts[0]  # e.g. "Brother_HL_L2440DW_series-42"

                # Try to find the Firestore job that owns this CUPS job
                # The CUPS job title is usually the filename; we use active_jobs to match
                # If any active Firestore job is still 'printing' → safe to resume
                # Otherwise → cancel to prevent ghost prints

                should_cancel = False
                try:
                    # Check ALL jobs with status=printing for this kiosk
                    docs = db.collection('print_jobs') \
                        .where('kioskId', '==', KIOSK_ID) \
                        .where('status', 'in', ['failed', 'refunded', 'completed']) \
                        .stream(timeout=10)
                    failed_job_ids = {doc.id for doc in docs}

                    # If the cups job ID suffix matches any active_jobs entry that is now failed
                    for fj_id in failed_job_ids:
                        if fj_id in active_jobs:
                            should_cancel = True
                            print(f"🚫 Watchdog: CUPS job {cups_job_id} belongs to already-failed/refunded Firestore job {fj_id} — cancelling spool to prevent ghost print.")
                            break

                    # If there are NO active jobs at all for this printer, be safe and cancel
                    if not should_cancel:
                        active_printing_docs = db.collection('print_jobs') \
                            .where('kioskId', '==', KIOSK_ID) \
                            .where('status', '==', 'printing') \
                            .stream(timeout=10)
                        active_printing_ids = {doc.id for doc in active_printing_docs}

                        if not active_printing_ids:
                            # No active Firestore job — this is a stale CUPS job, cancel it
                            should_cancel = True
                            print(f"🚫 Watchdog: No active Firestore jobs found — cancelling stale CUPS job {cups_job_id} to prevent ghost print.")

                except Exception as fs_err:
                    print(f"⚠️ Watchdog: Firestore check for CUPS job {cups_job_id} failed: {fs_err}. Cancelling job to be safe.")
                    should_cancel = True

                if should_cancel:
                    subprocess.run(["cancel", cups_job_id], capture_output=True)
                else:
                    print(f"🔓 Watchdog: Resuming CUPS job {cups_job_id} on {printer_name} (Firestore job is still active)...")
                    subprocess.run(["lp", "-i", cups_job_id, "-H", "resume"], capture_output=True)
    except Exception as e:
        print(f"⚠️ cancel_stale_cups_jobs_for_printer failed: {e}")


AUTO_RESUME_MAX_AGE = timedelta(minutes=45)


def is_eligible_for_auto_resume(doc_id, data, active_jobs, now, max_age=AUTO_RESUME_MAX_AGE):
    """
    Pure decision logic for whether a job stuck in "printing" should get one automatic resume
    attempt from the watchdog fallback. Kept separate from watchdog_loop (and free of any I/O)
    so it can be unit tested directly. Returns (eligible: bool, reason: str).

    STRICT AUTO-PRINT RULE: a job is only ever auto-resumed once, ever — tracked by a Firestore
    marker (autoResumedAt) that survives a Pi restart, unlike the in-memory active_jobs set alone.
    That in-memory-only check was the root cause of jobs getting reprinted without any customer
    instruction: it resets on every restart, so a whole backlog of jobs still marked "printing"
    (regardless of how old) looked "never tried" again and got blasted to the printer at once.
    Only jobs started recently are eligible — not merely "less than 24h old" but within a window
    that covers a genuine crashed-mid-print recovery, not a stale backlog. A job still stuck after
    its one attempt is left for the backend's own timeout/refund to resolve, never retried again.
    """
    if doc_id in active_jobs:
        return False, "already tracked as active in this process"
    if data.get("autoResumedAt"):
        return False, "already given one auto-resume attempt (persisted marker)"
    started_at = data.get("printStartedAt") or data.get("createdAt") or data.get("updatedAt")
    if not started_at:
        return False, "no timestamp to judge age from"
    age = now - started_at
    if age > max_age:
        return False, f"too old ({age} > {max_age})"
    return True, f"eligible (age {age})"


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
                        # Cancel stale spool entries for jobs already failed/refunded in Firestore
                        # before resuming to prevent ghost prints when printer comes back online
                        cancel_stale_cups_jobs_for_printer(printer)
                    
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
                                # Cancel stale spool entries for jobs already failed/refunded in Firestore
                                cancel_stale_cups_jobs_for_printer(printer)
                                stuck_cycles[printer] = 0
                    else:
                        stuck_cycles[printer] = 0
            
            # 2. Run Firestore polling every 10 seconds (every iteration).
            # See is_eligible_for_auto_resume() above for the strict auto-print rule this enforces.
            # At most a couple of jobs are auto-resumed per pass, so even a worst-case pile-up can
            # never fire an unbounded burst of unattended prints.
            MAX_AUTO_RESUME_PER_PASS = 2
            auto_resumed_this_pass = 0
            docs = db.collection('print_jobs').where(filter=FieldFilter('status', '==', 'printing')).where(filter=FieldFilter('kioskId', '==', KIOSK_ID)).stream(timeout=30)
            for doc in docs:
                if auto_resumed_this_pass >= MAX_AUTO_RESUME_PER_PASS:
                    break
                data = doc.to_dict()
                started_at = data.get("printStartedAt") or data.get("createdAt") or data.get("updatedAt")
                now = datetime.now(started_at.tzinfo) if started_at else datetime.now()
                eligible, reason = is_eligible_for_auto_resume(doc.id, data, active_jobs, now)
                if not eligible:
                    continue
                print(f"\n⚠️ Fallback detected stuck job: {doc.id} ({reason})")
                try:
                    doc.reference.update({"autoResumedAt": firestore.SERVER_TIMESTAMP})
                except Exception as mark_err:
                    print(f"⚠️ Failed to mark auto-resume for {doc.id}, skipping to be safe: {mark_err}")
                    continue
                active_jobs.add(doc.id)
                auto_resumed_this_pass += 1
                threading.Thread(target=process_job, args=(doc,), daemon=True).start()
                    
        except Exception as e:
            print(f"⚠️ Watchdog failed: {e}")
        
        counter += 1
        time.sleep(60)


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

def prefetch_one_file(doc_id, f_idx, f, total):
    """Prefetch one file entry into the edge cache. Returns True when a valid cache entry exists afterwards.

    The file is downloaded to a unique temporary file inside PRE_FETCH_DIR, strictly validated, and only then
    published with an atomic os.replace() to <docId>_<idx><ext>. A partial or invalid download is never visible
    under the cache name. Prefetch is only an optimisation: process_job re-validates and re-downloads anything
    missing or invalid, and prefetch never reports print failures.
    """
    if not isinstance(f, dict) or not f.get("url"):
        return False
    f_url = f.get("url")
    f_name = effective_file_name(f)
    cache_path = prefetch_cache_path(doc_id, f_idx, f_name)
    if os.path.exists(cache_path):
        cache_ok, _reason = validate_input_file(cache_path)
        if cache_ok:
            return True
        _safe_remove(cache_path)

    print(f"🚀 [PRE-FETCH] Pre-downloading file {f_idx+1}/{total} for job {doc_id} ({f_name}) in background...")
    downloaded = download_file(f_url, f_name, dest_dir=PRE_FETCH_DIR, temp_prefix=".partial_")
    if not downloaded:
        return False
    try:
        valid, reason = validate_input_file(downloaded)
        if not valid:
            print(f"⚠️ [PRE-FETCH] Job {doc_id} (file {f_idx+1}) not cached: {reason}")
            return False
        os.replace(downloaded, cache_path)
        downloaded = None
        print(f"⚡ [PRE-FETCH CACHED] Job {doc_id} (file {f_idx+1}) pre-downloaded & cached → {cache_path}")
        return True
    finally:
        _safe_remove(downloaded)

def prefetch_job(doc_snapshot):
    try:
        doc = doc_snapshot.to_dict()
        doc_id = doc_snapshot.id
        file_url = doc.get("fileUrl")
        file_name = doc.get("fileName", "document.pdf")

        files = doc.get("files")
        if not files:
            files = [{"url": file_url, "name": file_name, "type": doc.get("mimetype")}]
    except Exception as e:
        print(f"⚠️ [PRE-FETCH] Failed to read job for pre-fetch: {e}")
        return

    # Each entry is independent: one failed file never stops the remaining entries from being prefetched.
    for f_idx, f in enumerate(files):
        try:
            prefetch_one_file(doc_id, f_idx, f, len(files))
        except Exception as e:
            print(f"⚠️ [PRE-FETCH] Failed to pre-fetch file {f_idx+1} of job {doc_id}: {e}")

def on_prefetch_snapshot(doc_snapshot, changes, read_time):
    for change in changes:
        if change.type.name in ['ADDED', 'MODIFIED']:
            doc = change.document.to_dict()
            if doc.get("status") in ["paid", "pending"]:
                threading.Thread(target=prefetch_job, args=(change.document,), daemon=True).start()

def keep_warm_loop():
    # Wait 60 seconds after startup before first ping to allow systems to settle
    time.sleep(60)
    while True:
        try:
            requests.get("https://api-upqxuj7evq-uc.a.run.app/", timeout=10)
        except:
            pass
        time.sleep(600)

def startup_purge_cups():
    """Cancel all stale queued CUPS jobs on listener startup to prevent ghost prints when paper is refilled."""
    try:
        print("🧹 [STARTUP] Clearing stale CUPS queues to prevent ghost prints...")
        subprocess.run(["cancel", "-a", "-x"], capture_output=True, timeout=5)
    except Exception as e:
        print(f"⚠️ [STARTUP] Failed to purge stale CUPS queues: {e}")

# Startup runs only when executed as a script (systemd: python firebase_listener.py), never on import.
if __name__ == "__main__":
    ensure_work_dirs()
    init_firebase()

    startup_purge_cups()

    # Start background threads
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    threading.Thread(target=watchdog_loop, daemon=True).start()
    threading.Thread(target=keep_warm_loop, daemon=True).start()

    print(f"📡 Pi Listener Started. Identity: {KIOSK_ID}")
    print(f"📡 Target Printers -> B&W: {BW_PRINTER_NAME} | Color: {COLOR_PRINTER_NAME}")
    print(f"📡 Edge Pre-Fetch Cache Active: {PRE_FETCH_DIR}")
    print(f"📡 Waiting for jobs (status: 'printing', kioskId: '{KIOSK_ID}')...")

    query = db.collection('print_jobs').where(filter=FieldFilter('status', '==', 'printing')).where(filter=FieldFilter('kioskId', '==', KIOSK_ID))
    query_watch = query.on_snapshot(on_snapshot)

    query_prefetch = db.collection('print_jobs').where(filter=FieldFilter('status', '==', 'paid')).where(filter=FieldFilter('kioskId', '==', KIOSK_ID))
    query_prefetch_watch = query_prefetch.on_snapshot(on_prefetch_snapshot)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down listener.")
