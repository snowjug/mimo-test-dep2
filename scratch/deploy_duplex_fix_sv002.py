import paramiko
import sys
import os
import time

sys.stdout.reconfigure(encoding='utf-8')

HOST = '100.107.95.16'
USER = 'pi'
PASS = 'printpi'
LOCAL_SRC = r'C:\Users\chand\OneDrive\Desktop\1.0mimo\mimo-test-dep2\pi-listener\firebase_listener.py'
REMOTE_DST = '/home/pi/mimo/firebase_listener.py'

print(f"=== 1. CONNECTING TO TARGET HOST: {HOST} ({USER}) ===")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)

def run_cmd(cmd, desc=""):
    print(f"\n---> {desc} [$ {cmd}]")
    if "sudo " in cmd and "echo printpi | sudo -S" not in cmd:
        exec_cmd = cmd.replace("sudo ", "echo printpi | sudo -S ")
    else:
        exec_cmd = cmd
    stdin, stdout, stderr = client.exec_command(exec_cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    clean_err = "\n".join([l for l in err.splitlines() if "[sudo] password for" not in l])
    if out:
        print(out)
    if clean_err:
        print("STDERR:", clean_err)
    return out, clean_err

# Step 1: Confirm identity and service
out_id, _ = run_cmd("cat /etc/systemd/system/mimo-listener.service | grep -E 'KIOSK_ID|ExecStart|WorkingDirectory'", "Verify Service Identity")
if "KIOSK_ID=SV-002" not in out_id:
    print("❌ FATAL: KIOSK_ID is not SV-002! Aborting immediately.")
    sys.exit(1)

# Step 2: Create timestamped backup
timestamp = time.strftime('%Y%m%d_%H%M%S')
backup_path = f"/home/pi/mimo/firebase_listener.py.bak_{timestamp}"
run_cmd(f"cp {REMOTE_DST} {backup_path}", f"Create Timestamped Backup: {backup_path}")
run_cmd(f"ls -la {backup_path}", "Verify Backup File Exists")

# Step 3: Deploy local firebase_listener.py via SFTP
print(f"\n---> Uploading {LOCAL_SRC} to {REMOTE_DST}...")
sftp = client.open_sftp()
sftp.put(LOCAL_SRC, REMOTE_DST)
sftp.close()
print("✅ SFTP upload complete.")

# Step 4: Remote compile check
run_cmd("/home/pi/mimo/venv/bin/python -m py_compile /home/pi/mimo/firebase_listener.py", "Verify Remote Python Compilation")

# Step 5: Verify new logic in remote file
run_cmd("grep -n -A 15 'def wait_for_cups_job_completion' /home/pi/mimo/firebase_listener.py", "Inspect Deployed Logic")

# Step 6: Restart systemd service
run_cmd("sudo systemctl restart mimo-listener.service", "Restart mimo-listener.service")
time.sleep(3)

# Step 7: Verify service is active
status, _ = run_cmd("systemctl is-active mimo-listener.service", "Check Active Status")
if status != "active":
    print(f"❌ FATAL: Service status is {status}, expected 'active'!")

# Step 8: Check recent journal logs
run_cmd("journalctl -u mimo-listener -n 25 --no-pager", "Verify Startup Journal Logs")

# Step 9: Check printer status
run_cmd("lpstat -p -d", "Check Printers Status")

client.close()
print("\n🎉 Deployment and verification on SV-002 complete!")
