import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

stdin, stdout, stderr = client.exec_command('wlr-randr')
print("=== WLR-RANDR BEFORE ===")
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command('WAYLAND_DISPLAY=wayland-0 wlr-randr --output HDMI-A-2 --pos 0,0 2>/dev/null; wlr-randr')
print("=== WLR-RANDR AFTER POS 0,0 ===")
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
