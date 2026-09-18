import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.107.95.16', username='pi', password='printpi', timeout=10)

checks = [
    ('check_1_status', 'systemctl status mimo-listener.service --no-pager'),
    ('check_2_ps', "ps aux | grep '[f]irebase_listener.py'"),
    ('check_3_grep', 'grep -n -A12 -B5 "Epson L3250 physical" /home/pi/mimo/firebase_listener.py'),
    ('check_4_sed', "sed -n '735,755p' /home/pi/mimo/firebase_listener.py"),
    ('check_5_show', 'systemctl show mimo-listener.service -p ActiveState -p MainPID -p ActiveEnterTimestamp'),
    ('check_6_logs', 'journalctl -u mimo-listener.service -n 20 --no-pager')
]

results = {}
for key, cmd in checks:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    results[key] = {'cmd': cmd, 'stdout': out, 'stderr': err}

with open('scratch/live_verification_results.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print('All 6 remote checks completed.')
ssh.close()
