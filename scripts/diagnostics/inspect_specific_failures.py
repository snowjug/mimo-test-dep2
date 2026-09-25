import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

print("=== SEARCHING JOURNAL FOR JOBS 4804 AND 5521 ===")
stdin, stdout, stderr = client.exec_command('journalctl -u mimo-listener --since "2026-09-16 19:45:00" --no-pager')
out = stdout.read().decode('utf-8', errors='replace')
print("JOURNAL OUTPUT:\n", out)

print("\n=== CUPS ERROR LOG (LATEST 100 LINES) ===")
stdin, stdout, stderr = client.exec_command('echo printpi | sudo -S tail -n 100 /var/log/cups/error_log')
cups_err = stdout.read().decode('utf-8', errors='replace')
print("CUPS ERROR LOG:\n", cups_err)

client.close()
