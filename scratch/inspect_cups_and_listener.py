import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("CUPS PRINTERS & QUEUE", "lpstat -p; echo '---'; lpstat -a; echo '---'; lpstat -o"),
    ("RECENT COLOR / EPSON LOGS", "journalctl -u mimo-listener -n 500 --no-pager | grep -i -E 'color|epson|update_colour|process_job|sending to cups|cups:' | tail -n 50"),
    ("RECENT ERRORS IN JOURNAL", "journalctl -u mimo-listener -n 500 --no-pager | grep -i -E 'error|failed|traceback|exception' | tail -n 50"),
    ("SERVICE ENVIRONMENT", "systemctl show mimo-listener -p Environment,ExecStart"),
    ("LISTENER CHECKSUM", "sha256sum /home/pi/mimo/firebase_listener.py")
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
