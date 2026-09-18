import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

sftp = client.open_sftp()
sftp.get('/home/pi/mimo/firebase_listener.py', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/sv002_firebase_listener.py')
try:
    sftp.get('/etc/cups/ppd/Brother_HL_L2440DW_series.ppd', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/Brother_HL_L2440DW_series.ppd')
except Exception as e:
    print("Could not get ppd directly via sftp:", e)
sftp.close()

commands = [
    ("PRINTERS.CONF", "echo printpi | sudo -S cat /etc/cups/printers.conf"),
    ("PAGE_LOG", "echo printpi | sudo -S tail -n 40 /var/log/cups/page_log"),
    ("ERROR_LOG AROUND JOBS", "echo printpi | sudo -S grep -E '1630|1631|Brother' /var/log/cups/error_log | tail -n 50"),
    ("IPP ATTRIBUTES VIA IPPTOOL IF AVAILABLE", "ipptool -tv ipp://localhost/printers/Brother_HL_L2440DW_series get-printer-attributes.test 2>/dev/null | grep -i -E 'sides|media|duplex|finishings' | head -n 30")
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
print("Saved firebase_listener.py to scratch/sv002_firebase_listener.py")
