import paramiko
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = {
    "diff_against_bak_sept15": "diff -u /home/pi/mimo/firebase_listener.py.bak /home/pi/mimo/firebase_listener.py || true",
    "diff_against_backup_sept16": "diff -u /home/pi/mimo/firebase_listener.py.backup-20260916-191555 /home/pi/mimo/firebase_listener.py || true",
    "diff_against_bak_204035": "diff -u /home/pi/mimo/firebase_listener.py.bak_20260916_204035 /home/pi/mimo/firebase_listener.py || true",
    "grep_print_cups_options_bak": "grep -n -C 5 'cups' /home/pi/mimo/firebase_listener.py.bak || true",
    "grep_print_cups_options_current": "grep -n -C 5 'cups' /home/pi/mimo/firebase_listener.py || true",
    "check_ppd_diff": "diff -u /etc/cups/ppd/Brother_HL_L2440DW_series.ppd.O /etc/cups/ppd/Brother_HL_L2440DW_series.ppd || true",
    "check_printers_conf_diff": "diff -u /etc/cups/printers.conf.O /etc/cups/printers.conf || true",
    "check_cupsd_conf_diff": "diff -u /etc/cups/cupsd.conf.bak /etc/cups/cupsd.conf || true",
    "find_recent_modified_files": "find /etc/cups /home/pi/mimo /home/pi/.config -type f -mtime -3 -ls 2>/dev/null"
}

diff_results = {}
for name, cmd in commands.items():
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    diff_results[name] = {"stdout": out, "stderr": err}

client.close()

with open("scratch/pi_diff_results.json", "w", encoding="utf-8") as f:
    json.dump(diff_results, f, indent=2)

print("Diff analysis saved to scratch/pi_diff_results.json")
