import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("CUPS LOG LEVEL", "echo printpi | sudo -S grep -i LogLevel /etc/cups/cupsd.conf"),
    ("GREP ERROR_LOG FOR BROTHER BACKEND", "echo printpi | sudo -S grep -i -E 'backend|Brother|dnssd|ipp:|urf|raster' /var/log/cups/error_log | tail -n 60"),
    ("CHECK PRINTER STATE REASONS HISTORICAL", "echo printpi | sudo -S grep -i 'printer-state-reasons' /var/log/cups/error_log | tail -n 30"),
    ("CHECK IPP BACKEND OPTIONS & RESOLUTION", "avahi-browse -rt _ipp._tcp 2>/dev/null; avahi-browse -rt _ipps._tcp 2>/dev/null")
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
