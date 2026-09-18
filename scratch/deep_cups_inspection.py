import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("CUPS SPOOL FILES LIST", "echo printpi | sudo -S ls -la /var/spool/cups/"),
    ("CONTROL FILE c01630 (X8jn5oyxyy7Qg3OE1dsi)", "echo printpi | sudo -S strings /var/spool/cups/c01630 2>/dev/null || echo printpi | sudo -S cat /var/spool/cups/c01630 2>/dev/null"),
    ("CONTROL FILE c01631 (HvD6ju1BaS0kYWWXlOft)", "echo printpi | sudo -S strings /var/spool/cups/c01631 2>/dev/null || echo printpi | sudo -S cat /var/spool/cups/c01631 2>/dev/null"),
    ("FILE TYPE & PAGE COUNT OF RECENT SPOOL DATA FILES", "echo printpi | sudo -S file /var/spool/cups/d* 2>/dev/null; echo printpi | sudo -S pdfinfo /var/spool/cups/d01630-001 /var/spool/cups/d01631-001 2>/dev/null"),
    ("CUPS PRINTER PPD FULL DUMP", "cat /etc/cups/ppd/Brother_HL_L2440DW_series.ppd"),
    ("CHECK IPP USB OR IPP BACKEND CONFIG", "which ipp-usb; systemctl status ipp-usb 2>/dev/null; lpinfo -v")
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
