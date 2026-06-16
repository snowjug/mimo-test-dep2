const { execSync } = require('child_process');

const pythonScript = `
import urllib.request
import time
import socket

socket.setdefaulttimeout(30)

with open('/home/pi/mimo/firebase_listener.py', 'r') as f:
    content = f.read()

old_func = """def download_file(url, filepath):
    try:
        urllib.request.urlretrieve(url, filepath)
        return True
    except Exception as e:
        print(f"Failed to download: {e}")
        return False"""

old_func2 = """def download_file(url, local_filename):
    try:
        urllib.request.urlretrieve(url, local_filename)
        return True
    except Exception as e:
        print(f"[{datetime.now()}] Error downloading {url}: {e}")
        return False"""

old_func3 = """def download_file(url, local_filename, timeout=300):
    try:
        import urllib.request
        urllib.request.urlretrieve(url, local_filename)
        return True
    except Exception as e:
        print(f"[{datetime.now()}] Error downloading {url}: {e}")
        return False"""

new_func = """def download_file(url, local_filename, timeout=300):
    import time
    import socket
    import urllib.request
    from datetime import datetime
    max_retries = 5
    for attempt in range(max_retries):
        try:
            print(f"[{datetime.now()}] Downloading {url} (Attempt {attempt + 1}/{max_retries})...")
            socket.setdefaulttimeout(30)
            urllib.request.urlretrieve(url, local_filename)
            return True
        except Exception as e:
            print(f"[{datetime.now()}] Error downloading {url}: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
            else:
                return False
    return False"""

import re
# Just replace everything from 'def download_file(' to 'return False' with new_func
pattern = re.compile(r"def download_file\\(.*?return False", re.DOTALL)
content = pattern.sub(new_func, content)

with open('/home/pi/mimo/firebase_listener.py', 'w') as f:
    f.write(content)

import subprocess
subprocess.run(['sudo', 'systemctl', 'restart', 'mimo-listener'])
print("Patched and restarted!")
`;

require('fs').writeFileSync('patch2.py', pythonScript);

try {
  console.log("Copying patch to pi...");
  execSync('scp -o StrictHostKeyChecking=no patch2.py pi@100.107.95.16:/home/pi/patch_download2.py', {stdio: 'inherit'});
  console.log("Running patch on pi...");
  execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "python3 /home/pi/patch_download2.py"', {stdio: 'inherit'});
  console.log("Success");
} catch(e) {
  console.log("Error:", e.message);
}
