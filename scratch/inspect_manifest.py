import zipfile
import re

apk_path = r"LENOVO TABLET APP\app\build\outputs\apk\debug\app-debug.apk"
with zipfile.ZipFile(apk_path, 'r') as z:
    mb = z.read('AndroidManifest.xml')
    # search utf-16le strings
    u16_strings = re.findall(b'(?:[\x20-\x7e]\x00){3,}', mb)
    decoded = [s.decode('utf-16le') for s in u16_strings]
    print("UTF-16 strings in Manifest:")
    for s in decoded:
        if any(k in s.lower() for k in ['revautsav', 'mainactivity', 'kiosk', 'launcher']):
            print(" -", s)
