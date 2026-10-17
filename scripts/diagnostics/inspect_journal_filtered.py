import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

client = new_client()
connect(client, "SV-002", timeout=20)

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
