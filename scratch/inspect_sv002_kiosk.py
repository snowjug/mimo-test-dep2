import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("CHROMIUM FULL PROCESS ARGS", "ps aux | grep chromium | grep -v 'type='"),
    ("AUTOSTART SCRIPTS", "ls -la /home/pi/.config/autostart /home/pi/.config/wayfire.ini /home/pi/.config/labwc /etc/xdg/lxsession/LXDE-pi/autostart 2>/dev/null; cat /home/pi/.config/wayfire.ini /etc/xdg/lxsession/LXDE-pi/autostart /home/pi/.config/autostart/* 2>/dev/null"),
    ("SYSTEMD KIOSK SERVICES", "systemctl list-unit-files | grep -E 'kiosk|browser|chromium|display|x11|wayland'"),
    ("CHECK LOCAL WEBSERVER / PORTS", "ss -tulpn"),
    ("KIOSK RUN SCRIPT IF ANY", "cat /home/pi/kiosk.sh /home/pi/start_kiosk.sh /home/pi/run_kiosk.sh /home/pi/mimo/kiosk.sh 2>/dev/null"),
    ("TAKE SCREENSHOT OF WAYLAND/WAYFIRE DISPLAY", "grim /home/pi/screen.png 2>/dev/null || raspi2png -p /home/pi/screen.png 2>/dev/null || scrot /home/pi/screen.png 2>/dev/null; ls -lh /home/pi/screen.png 2>/dev/null")
]

for title, cmd in commands:
    print(f"\n=== {title} ===")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out:
        print(out)
    if err:
        print("[STDERR]", err)

client.close()
