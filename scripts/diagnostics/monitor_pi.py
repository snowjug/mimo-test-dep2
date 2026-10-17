import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402
import time
import sys

c = new_client()
print("Connecting to printpi...")
connect(c, "CV-001")
print("Connected. Tailing logs...")

# Tail the systemd journal for mimo-listener
stdin, stdout, stderr = c.exec_command('journalctl -u mimo-listener -f -n 0')

try:
    for line in iter(stdout.readline, ""):
        print(line, end="")
        sys.stdout.flush()
except KeyboardInterrupt:
    print("Exiting...")
finally:
    c.close()
