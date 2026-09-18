import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.107.95.16', username='pi', password='printpi', timeout=10)

remote_script = """
import firebase_admin
from firebase_admin import credentials, firestore
import json

cred = credentials.Certificate('/home/pi/mimo/firebase_credentials.json')
try:
    firebase_admin.initialize_app(cred)
except:
    pass
db = firestore.client()

# Check last 10 print jobs for SV-002
print("=== LAST 10 PRINT JOBS FOR SV-002 ===")
jobs = db.collection('print_jobs').where('kioskId', '==', 'SV-002').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(10).stream()

for j in jobs:
    d = j.to_dict()
    # serialize timestamps
    for k, v in list(d.items()):
        if hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
    print(f"ID: {j.id} | status: {d.get('status')} | isPrinted: {d.get('isPrinted')} | colorMode: {d.get('colorMode')} | printCode: {d.get('printCode')} | totalSheets: {d.get('totalSheets')} | sheetsCompleted: {d.get('sheetsCompleted')} | printerStatus: {d.get('printerStatus')}")
"""

stdin, stdout, stderr = ssh.exec_command(f"python3 -c {repr(remote_script)}")
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print("STDOUT:\n", out)
if err:
    print("STDERR:\n", err)
ssh.close()
