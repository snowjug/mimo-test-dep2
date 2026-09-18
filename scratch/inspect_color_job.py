import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("LOGS FOR RECENT JOB XPSARi7qlf0N5jOlWVZL", "journalctl -u mimo-listener --since '10:57:00' --no-pager"),
    ("CUPS LOGS FOR EPSON", "echo printpi | sudo -S tail -n 50 /var/log/cups/error_log | grep -i -E 'epson|XPSARi7|job|error'"),
    ("LPSTAT NOT COMPLETED", "lpstat -W not-completed -o"),
    ("LPSTAT COMPLETED", "lpstat -W completed -o | tail -n 10")
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
