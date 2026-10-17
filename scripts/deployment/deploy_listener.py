import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

c = new_client()
try:
    connect(c, "CV-001")
    
    print("Stopping mimo-listener service...")
    c.exec_command('@SUDO@ systemctl stop mimo-listener')
    
    print("Downloading updated listener directly from GitHub...")
    cmd = "curl -H 'Cache-Control: no-cache, no-store' -sL https://raw.githubusercontent.com/madhans7/mimo-test-dep2/main/pi_scripts/firebase_listener.py > /home/printpi/firebase_listener.py"
    stdin, stdout, stderr = c.exec_command(cmd)
    
    err = stderr.read().decode()
    if err:
        print("Error downloading:", err)
    
    print("Restarting mimo-listener service...")
    stdin, stdout, stderr = c.exec_command('@SUDO@ systemctl start mimo-listener')
    print("Done!")
finally:
    c.close()
