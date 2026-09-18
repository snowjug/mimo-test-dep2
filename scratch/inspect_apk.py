import os
import zipfile
import datetime

apk_path = r"LENOVO TABLET APP\app\build\outputs\apk\debug\app-debug.apk"

print(f"Checking APK: {apk_path}")
if not os.path.exists(apk_path):
    print("APK does NOT exist!")
    exit(1)

stat = os.stat(apk_path)
mtime = datetime.datetime.fromtimestamp(stat.st_mtime)
print(f"File Exists: True")
print(f"File Size: {stat.st_size} bytes ({stat.st_size / (1024*1024):.2f} MB)")
print(f"Last Modified Time: {mtime}")

target_url = "https://mimo-frontend-three.vercel.app/?kioskId=CV-001"
old_url = "https://mimo-kiosk-app.vercel.app/"
target_url_bytes = target_url.encode('utf-8')
old_url_bytes = old_url.encode('utf-8')

with zipfile.ZipFile(apk_path, 'r') as z:
    names = z.namelist()
    print(f"Total entries in APK archive: {len(names)}")
    dex_files = [n for n in names if n.endswith('.dex')]
    print(f"Dex files found: {dex_files}")
    
    found_target = False
    found_old = False
    for dex_name in dex_files:
        dex_data = z.read(dex_name)
        if target_url_bytes in dex_data:
            found_target = True
            print(f"FOUND TARGET URL in {dex_name}: {target_url}")
        if old_url_bytes in dex_data:
            found_old = True
            print(f"FOUND OLD URL in {dex_name}: {old_url}")
            
    print(f"Contains new target URL: {found_target}")
    print(f"Contains old URL: {found_old}")
