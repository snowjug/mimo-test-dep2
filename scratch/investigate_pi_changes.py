import paramiko
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = {
    "listener_files_stat": "ls -la --time-style=full-iso /home/pi/mimo/ ; ls -la --time-style=full-iso /home/pi/mimo/*.bak /home/pi/mimo/*.old /home/pi/mimo/*backup* 2>/dev/null || true",
    "git_status_mimo": "cd /home/pi/mimo && git status 2>/dev/null || true; cd /home/pi/mimo && git log -n 10 --stat 2>/dev/null || true; cd /home/pi/mimo && git diff HEAD 2>/dev/null || true",
    "bash_history": "tail -n 100 /home/pi/.bash_history 2>/dev/null || true",
    "root_bash_history": "echo printpi | sudo -S tail -n 100 /root/.bash_history 2>/dev/null || true",
    "cups_files_stat": "echo printpi | sudo -S ls -la --time-style=full-iso /etc/cups/ /etc/cups/ppd/ 2>/dev/null",
    "lpstat_v": "lpstat -v",
    "lpstat_p": "lpstat -p -d",
    "lpoptions_brother": "lpoptions -p Brother_HL_L2440DW_series -l ; echo '=== raw lpoptions ===' ; lpoptions -p Brother_HL_L2440DW_series",
    "printers_conf": "echo printpi | sudo -S cat /etc/cups/printers.conf",
    "cupsd_conf": "echo printpi | sudo -S cat /etc/cups/cupsd.conf | grep -v '^#' | grep -v '^$'",
    "cups_browsed_conf": "echo printpi | sudo -S cat /etc/cups/cups-browsed.conf 2>/dev/null | grep -v '^#' | grep -v '^$' || true",
    "mimo_listener_service": "systemctl cat mimo-listener.service",
    "recent_journal_cups": "journalctl -u cups --since 'yesterday' -n 150 --no-pager",
    "recent_journal_cups_browsed": "journalctl -u cups-browsed --since 'yesterday' -n 150 --no-pager",
    "recent_journal_mimo": "journalctl -u mimo-listener --since 'yesterday' -n 150 --no-pager",
    "cups_page_log": "echo printpi | sudo -S tail -n 50 /var/log/cups/page_log 2>/dev/null || true",
    "cups_error_log": "echo printpi | sudo -S tail -n 50 /var/log/cups/error_log 2>/dev/null || true",
    "listener_full_source": "cat /home/pi/mimo/firebase_listener.py",
    "system_date_check": "date"
}

results = {}
for name, cmd in commands.items():
    print(f"Running {name}...")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    results[name] = {
        "stdout": out,
        "stderr": err
    }

client.close()

with open("scratch/pi_investigation_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("Investigation complete! Results saved to scratch/pi_investigation_results.json")
