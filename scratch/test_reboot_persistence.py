import paramiko
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

PI_IP = '100.107.95.16'
USER = 'pi'
PASS = 'printpi'

print("=== 1. TRIGGERING SUDO REBOOT ON SV-002 ===")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect(PI_IP, username=USER, password=PASS, timeout=10)
    client.exec_command('echo printpi | sudo -S reboot')
    client.close()
except Exception as e:
    print("Reboot signal sent:", e)

print("Waiting 20 seconds for system to shut down and reboot...")
time.sleep(20)

print("=== 2. POLLING SSH RECONNECTION ===")
reconnected = False
for attempt in range(1, 30):
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(PI_IP, username=USER, password=PASS, timeout=5)
        print(f"✅ SSH reconnected successfully on attempt {attempt}!")
        reconnected = True
        break
    except Exception as e:
        print(f"Attempt {attempt}: Waiting for Pi to come online...")
        time.sleep(5)

if not reconnected:
    print("❌ Failed to reconnect to Pi within timeout.")
    sys.exit(1)

print("Waiting 15 seconds for Wayland, labwc autostart, and Chromium kiosk to launch...")
time.sleep(15)

print("\n=== 3. VERIFYING DISPLAY CONFIGURATION (wlr-randr) ===")
stdin, stdout, stderr = client.exec_command("wlr-randr")
wlr_out = stdout.read().decode('utf-8', errors='replace')
print(wlr_out)

print("\n=== 4. VERIFYING CHROMIUM KIOSK PROCESS ===")
stdin, stdout, stderr = client.exec_command("ps aux | grep chromium | grep -v 'type='")
ps_out = stdout.read().decode('utf-8', errors='replace')
print(ps_out)

print("\n=== 5. CAPTURING POST-REBOOT SCREENSHOT ===")
stdin, stdout, stderr = client.exec_command("WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 grim /home/pi/screen_post_reboot.png")
grim_out = stdout.read().decode('utf-8', errors='replace')
grim_err = stderr.read().decode('utf-8', errors='replace')
print("grim:", grim_out, grim_err)

sftp = client.open_sftp()
sftp.get('/home/pi/screen_post_reboot.png', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/sv002_screen_post_reboot.png')
sftp.close()

client.close()
print("Downloaded post-reboot screenshot to scratch/sv002_screen_post_reboot.png")
