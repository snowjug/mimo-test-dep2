import paramiko
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

new_autostart_content = """# Default system-wide autostart commands
/usr/bin/lwrespawn /usr/bin/pcmanfm --desktop --profile LXDE-pi &
/usr/bin/lwrespawn /usr/bin/wf-panel-pi &
/usr/bin/kanshi &
/usr/bin/lxsession-xdg-autostart

# Map physical Leoxsys display (HDMI-A-2) to origin (0,0) at 1920x1080 and disable ghost HDMI-A-1
wlr-randr --output HDMI-A-1 --off --output HDMI-A-2 --pos 0,0 --mode 1920x1080 &

# Start Chromium in fullscreen kiosk mode
# --disk-cache-size=1 ensures fresh UI is always loaded after deployments
chromium --kiosk --noerrdialogs --disable-infobars --no-first-run --ozone-platform=wayland --password-store=basic --autoplay-policy=no-user-gesture-required --disk-cache-size=1 https://mimo-2-0.vercel.app/?kioskId=SV-002 &
"""

print("=== 1. BACKING UP AND WRITING /home/pi/.config/labwc/autostart ===")
sftp = client.open_sftp()
try:
    sftp.rename('/home/pi/.config/labwc/autostart', '/home/pi/.config/labwc/autostart.bak2')
except Exception as e:
    print("Backup note:", e)

with sftp.file('/home/pi/.config/labwc/autostart', 'w') as f:
    f.write(new_autostart_content)
sftp.close()

print("=== 2. APPLYING DISPLAY FIX LIVE VIA WAYLAND ===")
stdin, stdout, stderr = client.exec_command("WAYLAND_DISPLAY=wayland-0 wlr-randr --output HDMI-A-1 --off --output HDMI-A-2 --pos 0,0 --mode 1920x1080")
print("wlr-randr stdout:", stdout.read().decode('utf-8'))
print("wlr-randr stderr:", stderr.read().decode('utf-8'))

print("=== 3. RESTARTING CHROMIUM KIOSK PROCESS ===")
client.exec_command("killall -9 chromium 2>/dev/null; killall -9 chromium-browser 2>/dev/null")
time.sleep(2)

# Start Chromium in wayland session background
client.exec_command("WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 nohup chromium --kiosk --noerrdialogs --disable-infobars --no-first-run --ozone-platform=wayland --password-store=basic --autoplay-policy=no-user-gesture-required --disk-cache-size=1 https://mimo-2-0.vercel.app/?kioskId=SV-002 > /dev/null 2>&1 &")
time.sleep(5)

print("=== 4. VERIFYING DISPLAY GEOMETRY & CAPTURING SCREENSHOT ===")
stdin, stdout, stderr = client.exec_command("wlr-randr")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = client.exec_command("WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 grim /home/pi/screen_fixed.png")
print("grim output:", stdout.read().decode('utf-8'), stderr.read().decode('utf-8'))

sftp = client.open_sftp()
sftp.get('/home/pi/screen_fixed.png', 'c:/Users/chand/OneDrive/Desktop/1.0mimo/mimo-test-dep2/scratch/sv002_screen_fixed.png')
sftp.close()

client.close()
print("Downloaded fixed screen to scratch/sv002_screen_fixed.png")
