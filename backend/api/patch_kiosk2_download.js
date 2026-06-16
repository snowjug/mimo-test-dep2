const { execSync } = require('child_process');

const patchCode = `
import urllib.request
import time

def download_file(url, local_filename, max_retries=5):
    for attempt in range(max_retries):
        try:
            print(f"[{datetime.now()}] Downloading {url} (Attempt {attempt + 1}/{max_retries})...")
            # Set a global socket timeout just in case it hangs
            import socket
            socket.setdefaulttimeout(30)
            urllib.request.urlretrieve(url, local_filename)
            return True
        except Exception as e:
            print(f"[{datetime.now()}] Error downloading {url}: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
            else:
                return False
    return False

# Replace the original download_file function with our new one
import re
with open('/home/pi/mimo/firebase_listener.py', 'r') as f:
    content = f.read()

pattern = re.compile(r"def download_file\\(.*?return False", re.DOTALL)
new_content = pattern.sub(download_file.__code__.co_consts[0] if hasattr(download_file, '__code__') else '''def download_file(url, local_filename, max_retries=5):
    for attempt in range(max_retries):
        try:
            from datetime import datetime
            import socket
            import urllib.request
            import time
            print(f"[{datetime.now()}] Downloading {url} (Attempt {attempt + 1}/{max_retries})...")
            socket.setdefaulttimeout(30)
            urllib.request.urlretrieve(url, local_filename)
            return True
        except Exception as e:
            from datetime import datetime
            import time
            print(f"[{datetime.now()}] Error downloading {url}: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
            else:
                return False
    return False''', content)

with open('/home/pi/mimo/firebase_listener.py', 'w') as f:
    f.write(new_content)

import subprocess
subprocess.run(['sudo', 'systemctl', 'restart', 'mimo-listener'])
print("Patched and restarted!")
`;

require('fs').writeFileSync('patch.py', patchCode);

try {
  console.log("Copying patch to pi...");
  execSync('scp -o StrictHostKeyChecking=no patch.py pi@100.107.95.16:/home/pi/patch_download.py', {stdio: 'inherit'});
  console.log("Running patch on pi...");
  execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "python3 /home/pi/patch_download.py"', {stdio: 'inherit'});
  console.log("Success");
} catch(e) {
  console.log("Error:", e.message);
}
