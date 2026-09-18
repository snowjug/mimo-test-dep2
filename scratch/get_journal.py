import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

print("=== MIMO-LISTENER FULL JOURNAL (LAST 100 LINES) ===")
stdin, stdout, stderr = client.exec_command('journalctl -u mimo-listener -n 100 --no-pager')
out = stdout.read().decode('utf-8', errors='replace')
print(out)

client.close()
