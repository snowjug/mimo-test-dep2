import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("TEST CUPSFILTER SIMPLEX", "echo printpi | sudo -S cupsfilter -p /etc/cups/ppd/Brother_HL_L2440DW_series.ppd -m image/urf -o media=A4 -o fit-to-page -o sides=one-sided /var/spool/cups/d01630-001 > /tmp/test_simplex.urf 2>&1"),
    ("TEST CUPSFILTER DUPLEX", "echo printpi | sudo -S cupsfilter -p /etc/cups/ppd/Brother_HL_L2440DW_series.ppd -m image/urf -o media=A4 -o fit-to-page -o sides=two-sided-long-edge /var/spool/cups/d01630-001 > /tmp/test_duplex.urf 2>&1"),
    ("CHECK FILTER STDERR / PIPELINE", "echo printpi | sudo -S cupsfilter -p /etc/cups/ppd/Brother_HL_L2440DW_series.ppd -m image/urf -o media=A4 -o fit-to-page -o sides=two-sided-long-edge /var/spool/cups/d01630-001 2>&1 >/dev/null"),
    ("CHECK URF SIZES & HEADERS", "echo printpi | sudo -S ls -lh /tmp/test_simplex.urf /tmp/test_duplex.urf; echo printpi | sudo -S head -c 64 /tmp/test_simplex.urf | xxd 2>/dev/null || od -c -N 64 /tmp/test_simplex.urf")
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
