import subprocess
import paramiko
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

print("=" * 60)
print("1. LIVE SV-002 SSH DEEP AUDIT (100.107.95.16)")
print("=" * 60)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.107.95.16', username='pi', password='printpi', timeout=10)

def run_ssh(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

# Check service & process
out_svc, _ = run_ssh("systemctl is-active mimo-listener.service")
print(f"mimo-listener.service active: {out_svc.strip()}")

# Check printer queues and status
print("\n--- Printer Status (lpstat -p) ---")
out_lpstat, _ = run_ssh("lpstat -p")
print(out_lpstat.strip())

print("\n--- Active/Pending CUPS Jobs (lpstat -o) ---")
out_jobs, _ = run_ssh("lpstat -o")
print(out_jobs.strip() if out_jobs.strip() else "No pending CUPS jobs (queue is clear)")

# Check recent journal logs (last 50 lines)
print("\n--- Recent mimo-listener.service Journal Logs ---")
out_logs, _ = run_ssh("journalctl -u mimo-listener.service -n 50 --no-pager")
print(out_logs)

# Check recent cups error log
print("\n--- Recent CUPS Error Log (last 20 lines) ---")
out_cups_err, _ = run_ssh("tail -n 20 /var/log/cups/error_log 2>/dev/null || true")
print(out_cups_err if out_cups_err.strip() else "CUPS error log empty/no errors")

ssh.close()

print("\n" + "=" * 60)
print("2. LIVE PRODUCTION WEBSITE & API VERIFICATION")
print("=" * 60)

# Check Vercel deployed frontend
try:
    req = urllib.request.Request('https://mimo-2-0.vercel.app/?kioskId=SV-002', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"Vercel frontend HTTP status: {resp.status}")
        body = resp.read().decode('utf-8', errors='replace')
        print(f"Page title/head loaded: {'<title>' in body or 'vite' in body or 'mimo' in body.lower()}")
except Exception as e:
    print(f"Vercel frontend error: {e}")

# Check Backend API /kiosk/job-status with dummy code
try:
    req_api = urllib.request.Request('https://api-upqxuj7evq-uc.a.run.app/kiosk/job-status?printCode=NONEXISTENT_TEST_CODE', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req_api, timeout=10) as resp:
        print(f"Backend API HTTP status: {resp.status}")
except urllib.error.HTTPError as e:
    # 404 is expected for NONEXISTENT_TEST_CODE
    print(f"Backend API HTTP status for test code: {e.code} (Expected 404 for nonexistent code)")
except Exception as e:
    print(f"Backend API error: {e}")
