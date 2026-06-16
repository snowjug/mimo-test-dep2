import paramiko
import sys
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('100.70.107.44', username='printpi', password='printpi')
stdin, stdout, stderr = c.exec_command('cat /home/printpi/firebase_listener.py')
with open('listener_code2.py', 'wb') as f:
    f.write(stdout.read())
c.close()
