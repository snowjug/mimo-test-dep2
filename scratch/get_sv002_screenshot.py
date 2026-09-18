import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

sftp = client.open_sftp()
sftp.get('/home/pi/screen.png', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/sv002_live_screen.png')
sftp.close()

stdin, stdout, stderr = client.exec_command('cat /home/pi/.config/labwc/autostart')
print("=== /home/pi/.config/labwc/autostart ===")
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
print("Saved screenshot to scratch/sv002_live_screen.png")
