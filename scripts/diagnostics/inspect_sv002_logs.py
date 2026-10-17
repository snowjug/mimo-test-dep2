import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402
import json
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

print("=== 1. CONNECTING TO SV-002 (100.107.95.16) ===")
client = new_client()
connect(client, "SV-002", timeout=20)

print("\n=== 2. MIMO-LISTENER SERVICE JOURNAL (LATEST 100 LINES) ===")
stdin, stdout, stderr = client.exec_command('journalctl -u mimo-listener -n 100 --no-pager')
print(stdout.read().decode('utf-8', errors='replace'))

print("\n=== 3. RUNNING PROCESSES (CHROMIUM / KIOSK BROWSER / LISTENER) ===")
stdin, stdout, stderr = client.exec_command('ps aux | grep -E "chromium|firebase_listener|mimo" | grep -v grep')
print(stdout.read().decode('utf-8', errors='replace'))

print("\n=== 4. CUPS RECENT JOBS & STATUS ===")
stdin, stdout, stderr = client.exec_command('lpstat -o; echo "--- COMPLETED JOBS ---"; lpstat -W completed -o | tail -n 20')
print(stdout.read().decode('utf-8', errors='replace'))

print("\n=== 5. CHECK /home/pi/mimo/firebase_listener.py HASH & VERSION ===")
stdin, stdout, stderr = client.exec_command('sha256sum /home/pi/mimo/firebase_listener.py; grep -n "KIOSK_ID" /home/pi/mimo/firebase_listener.py')
print(stdout.read().decode('utf-8', errors='replace'))

print("\n=== 6. CHECK /etc/systemd/system/mimo-listener.service ===")
stdin, stdout, stderr = client.exec_command('cat /etc/systemd/system/mimo-listener.service')
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
