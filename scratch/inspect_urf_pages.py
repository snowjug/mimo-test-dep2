import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("RUN CUPSFILTER CLEAN BINARY OUTPUT", "echo printpi | sudo -S cupsfilter -p /etc/cups/ppd/Brother_HL_L2440DW_series.ppd -m image/urf -o media=A4 -o fit-to-page -o sides=two-sided-long-edge /var/spool/cups/d01630-001 2>/tmp/filter_debug.log > /tmp/clean_duplex.urf"),
    ("CHECK FILTER LOG", "cat /tmp/filter_debug.log | grep -E 'PAGE:|Processing|Duplex|cupsWidth|PageSize'"),
    ("CHECK URF FILE INFO", "file /tmp/clean_duplex.urf; ls -lh /tmp/clean_duplex.urf; python3 -c \"with open('/tmp/clean_duplex.urf', 'rb') as f: data = f.read(); print('URF Magic:', data[:12]); print('UNIRAST occurrences:', data.count(b'UNIRAST')); import struct; print('Page count from header:', struct.unpack('>I', data[8:12])[0] if len(data)>=12 else 'short')\"")
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
