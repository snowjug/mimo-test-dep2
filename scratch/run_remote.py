import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.107.95.16', username='pi', password='printpi', timeout=10)

script = """
import firebase_admin
from firebase_admin import credentials, firestore
import json

cred = credentials.Certificate('/home/pi/mimo/serviceAccountKey.json')
try:
    firebase_admin.initialize_app(cred)
except:
    pass
db = firestore.client()

# Direct doc XPSARi7qlf0N5jOlWVZL
doc = db.collection('print_jobs').document('XPSARi7qlf0N5jOlWVZL').get()
print('=== JOB XPSARi7qlf0N5jOlWVZL ===')
if doc.exists:
    d = doc.to_dict()
    for k, v in d.items():
        print(f"  {k}: {v}")
    pcode = d.get('printCode')
    if pcode:
        print(f"\\n=== ALL JOBS WITH PRINT CODE {pcode} ===")
        docs = db.collection('print_jobs').where('printCode', '==', pcode).stream()
        for j in docs:
            jd = j.to_dict()
            print(f"Doc ID: {j.id}")
            for k in ['status', 'isPrinted', 'colorMode', 'printCode', 'totalSheets', 'sheetsCompleted', 'printerStatus', 'copies', 'pageCount', 'createdAt', 'updatedAt', 'printedAt']:
                print(f"    {k}: {jd.get(k)}")
else:
    print('Doc not found')
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/query_jobs.py', 'w') as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('/home/pi/mimo/venv/bin/python /tmp/query_jobs.py')
print('STDOUT:\n', stdout.read().decode('utf-8', errors='replace'))
print('STDERR:\n', stderr.read().decode('utf-8', errors='replace'))
ssh.close()
