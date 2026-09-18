import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

sftp = client.open_sftp()
sftp.get('/home/pi/mimo/firebase_listener.py', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/live_pi_listener.py')
sftp.close()
print("Successfully downloaded /home/pi/mimo/firebase_listener.py to scratch/live_pi_listener.py")

client.close()
