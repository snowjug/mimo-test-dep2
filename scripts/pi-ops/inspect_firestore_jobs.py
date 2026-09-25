import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

py_script = """import firebase_admin
from firebase_admin import credentials, firestore
import json

cred = credentials.Certificate('/home/pi/mimo/serviceAccountKey.json')
try:
    app = firebase_admin.initialize_app(cred)
except:
    pass

db = firestore.client()

docs = db.collection('print_jobs').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(10).stream()

print('--- LATEST 10 PRINT JOBS ---')
for d in docs:
    data = d.to_dict()
    print(json.dumps({
        'id': d.id,
        'printCode': data.get('printCode'),
        'kioskId': data.get('kioskId'),
        'status': data.get('status'),
        'isPrinted': data.get('isPrinted'),
        'totalSheets': data.get('totalSheets'),
        'sheetsCompleted': data.get('sheetsCompleted'),
        'printerStatus': data.get('printerStatus'),
        'pageCount': data.get('pageCount'),
        'copies': data.get('copies'),
        'createdAt': str(data.get('createdAt')),
        'updatedAt': str(data.get('updatedAt')),
        'printedAt': str(data.get('printedAt'))
    }, indent=2))
"""

sftp = client.open_sftp()
with sftp.file('/tmp/check_jobs.py', 'w') as f:
    f.write(py_script)
sftp.close()

stdin, stdout, stderr = client.exec_command('/home/pi/mimo/venv/bin/python /tmp/check_jobs.py')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print("STDOUT:\n", out)
if err:
    print("STDERR:\n", err)

client.close()
