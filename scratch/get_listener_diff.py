import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

cmd = "python3 -c \"import difflib; f1 = open('/home/pi/mimo/firebase_listener.py.bak').readlines(); f2 = open('/home/pi/mimo/firebase_listener.py').readlines(); print(''.join(difflib.unified_diff(f1, f2, fromfile='bak_sept15', tofile='current_sept16')))\""
stdin, stdout, stderr = client.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace')
print(out[:4000])

client.close()
