import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402
c = new_client()
connect(c, "CV-001")
stdin, stdout, stderr = c.exec_command('cat /home/printpi/firebase_listener.py')
with open('listener_code2.py', 'wb') as f:
    f.write(stdout.read())
c.close()
