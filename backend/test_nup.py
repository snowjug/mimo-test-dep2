from PyPDF2 import PdfReader, PdfWriter, PageObject, Transformation
import io
import os
from PIL import Image

img = Image.new('RGB', (1200, 1800), color='blue')
img.save('test_blue.pdf', 'PDF', resolution=300.0)

def impose_nup(input_pdf, output_pdf, layout_num):
    with open(input_pdf, "rb") as f:
        pdf_bytes = f.read()

    writer = PdfWriter()
    
    A4_W, A4_H = 595.276, 841.890
    
    cols, rows = 2, 2
    canvas_w, canvas_h = A4_W, A4_H
        
    cell_w = canvas_w / cols
    cell_h = canvas_h / rows
    
    base_reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(base_reader.pages)
    
    if total_pages == 1:
        total_pages = int(layout_num)
        is_single = True
    else:
        is_single = False
    
    current_page_idx = 0
    while current_page_idx < total_pages:
        new_page = PageObject.create_blank_page(width=canvas_w, height=canvas_h)
        for row in range(rows):
            for col in range(cols):
                if current_page_idx >= total_pages:
                    break
                
                fresh_reader = PdfReader(io.BytesIO(pdf_bytes))
                p = fresh_reader.pages[0 if is_single else current_page_idx]
                
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

try:
    impose_nup('test_blue.pdf', 'imposed_blue.pdf', 4)
    print("PyPDF2 N-up complete")
except Exception as e:
    print("Error:", e)
