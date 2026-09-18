import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("INSPECT d01630-001 PAGES & BOXES", """echo printpi | sudo -S python3 -c "
import subprocess
out = subprocess.run(['pdfinfo', '-box', '/var/spool/cups/d01630-001'], capture_output=True, text=True)
print(out.stdout)
" """),
    ("CHECK GHOSTSCRIPT PAGE COUNT ON d01630-001", """echo printpi | sudo -S gs -q -dNODISPLAY -c "('/var/spool/cups/d01630-001') (r) file runpdfbegin pdfpagecount = quit" """)
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
