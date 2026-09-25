import subprocess
import paramiko
import json
import datetime
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("=" * 60)
print("1. GIT ORIGIN/MAIN VERIFICATION")
print("=" * 60)

raw = subprocess.check_output(['git', 'show', 'origin/main:pi-listener/firebase_listener.py'])
text = raw.decode('utf-8', errors='replace')

checks = {
    "is_duplex parameter": "def wait_for_cups_job_completion(cups_job_id: int, total_sheets: int = 1, is_color: bool = False, is_duplex: bool = False" in text,
    "duplex B&W cadence 8.5": "per_sheet_sec = 8.5 if is_duplex else 2.2" in text,
    "duplex timeout buffer": "timeout_sec = max(60, int(60 + warmup_sec + (total_sheets * (20 if is_duplex else 8))))" in text,
    "cups_confirmed and elapsed >= required_duration": "if cups_confirmed and elapsed >= required_duration:" in text,
    "is_duplex passed from print_file": "is_duplex = (double_sided == \"double\")" in text
}

for name, res in checks.items():
    print(f"  [{'PASS' if res else 'FAIL'}] {name}")

print("\n" + "=" * 60)
print("2. LIVE SV-002 SSH AUDIT (100.107.95.16)")
print("=" * 60)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.107.95.16', username='pi', password='printpi', timeout=10)

def run_ssh(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

# Service status
print("\n--- mimo-listener.service Status ---")
out, err = run_ssh("systemctl status mimo-listener.service --no-pager")
print(out)

# Process status
print("\n--- Running Process (ps aux) ---")
out, err = run_ssh("ps aux | grep firebase_listener | grep -v grep")
print(out.strip())

# Grep live file
print("\n--- Live /home/pi/mimo/firebase_listener.py Grep ---")
out, err = run_ssh(r'grep -n -E "is_duplex|8\.5|timeout_sec|required_duration" /home/pi/mimo/firebase_listener.py')
print(out)

# Check file modification time vs process start time
print("\n--- Process Start Time vs File Timestamp ---")
out_stat, _ = run_ssh("stat -c '%y' /home/pi/mimo/firebase_listener.py")
print(f"File modification time: {out_stat.strip()}")

out_etime, _ = run_ssh("ps -eo pid,lstart,etime,cmd | grep firebase_listener | grep -v grep")
print(f"Process start info: {out_etime.strip()}")

# Check kiosk display
print("\n--- SV-002 Kiosk Browser Check ---")
out_kiosk, _ = run_ssh("ps aux | grep chromium | grep -v grep")
print(out_kiosk)

out_url, _ = run_ssh("ps aux | grep -o 'https://mimo-2-0.vercel.app[^ ]*' | head -n 1")
print(f"Active Kiosk URL: {out_url.strip()}")

ssh.close()
