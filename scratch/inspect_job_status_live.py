import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("LOGS FOR JOB XPSARi7qlf0N5jOlWVZL AFTER 10:58:50", "journalctl -u mimo-listener --since '10:58:50' --no-pager"),
    ("CUPS LOGS AFTER 10:58", "echo printpi | sudo -S tail -n 80 /var/log/cups/error_log"),
    ("PAGE LOG", "echo printpi | sudo -S tail -n 20 /var/log/cups/page_log"),
    ("LPSTAT -o", "lpstat -o"),
    ("LPSTAT -W completed -o", "lpstat -W completed -o | tail -n 10")
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
