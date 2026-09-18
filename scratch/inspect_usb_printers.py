import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("LSUSB", "lsusb"),
    ("LPSTAT -v", "lpstat -v"),
    ("LPSTAT -t", "lpstat -t"),
    ("RECENT COLOR JOBS IN FIRESTORE / LOGS", "journalctl -u mimo-listener -n 2000 --no-pager | grep -i -E 'color|epson|Brother_DCP|T236' | tail -n 50")
]

for title, cmd in commands:
    print(f"\n==================== {title} ====================")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out:
        print(out)
    if err:
        print("[STDERR]", err)

client.close()
