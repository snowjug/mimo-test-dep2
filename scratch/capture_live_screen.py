import paramiko
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

stdin, stdout, stderr = client.exec_command('ps aux | grep chromium | grep -v grep')
print("=== CHROMIUM PROCESSES ===")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = client.exec_command("WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 grim /home/pi/screen_live.png")
print(stdout.read().decode('utf-8'), stderr.read().decode('utf-8'))

sftp = client.open_sftp()
sftp.get('/home/pi/screen_live.png', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/sv002_screen_live.png')
sftp.close()

client.close()
print("Downloaded to scratch/sv002_screen_live.png")
