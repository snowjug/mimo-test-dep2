import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

print("=== CHECK SYSTEM DATE & JOURNAL LOGS FOR 4804 & 5521 ===")
stdin, stdout, stderr = client.exec_command('date; journalctl -u mimo-listener --grep "4804|5521|1243|awdOU9Q|Y0yb9Y|MpSMsmol" -n 50 --no-pager')
out = stdout.read().decode('utf-8', errors='replace')
print(out)

print("\n=== LATEST 300 LINES OF MIMO-LISTENER JOURNAL ===")
stdin, stdout, stderr = client.exec_command('journalctl -u mimo-listener -n 300 --no-pager')
out300 = stdout.read().decode('utf-8', errors='replace')
# Filter lines that are not UserWarning
clean_lines = [l for l in out300.splitlines() if "UserWarning" not in l and "return query.where" not in l and "docs = db.collection" not in l]
print("\n".join(clean_lines))

client.close()
