import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("DISPLAY INFO (wlr-randr)", "wlr-randr 2>/dev/null || xrandr 2>/dev/null"),
    ("LABWC CONFIG", "cat /home/pi/.config/labwc/rc.xml 2>/dev/null | grep -i -E 'output|rotate|scale|mode'"),
    ("KANSHI CONFIG", "cat /home/pi/.config/kanshi/config 2>/dev/null"),
    ("CHECK WAYLAND ENVIRONMENT", "cat /proc/$(pgrep -o labwc)/environ 2>/dev/null | tr '\\0' '\\n' | grep -E 'WAYLAND|DISPLAY|XDG'"),
    ("CHROMIUM LOGS / CRASHES", "ls -la /home/pi/.config/chromium/Crash\\ Reports /home/pi/.config/chromium/Default 2>/dev/null"),
    ("SYSTEMD JOURNAL LAST 50 FOR KIOSK / DISPLAY", "journalctl -e -n 50 --no-pager | grep -i -E 'chromium|wayland|drm|hdmi|screen|kiosk'")
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
