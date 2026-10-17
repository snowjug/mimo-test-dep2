import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

c = new_client()
try:
    connect(c, "CV-001", timeout=10)
    
    print("=== Printer Status ===")
    stdin, stdout, stderr = c.exec_command('lpstat -p Epson_L3250')
    print(stdout.read().decode().strip())
    
    print("\n=== Completed Jobs ===")
    stdin, stdout, stderr = c.exec_command('lpstat -W completed | head -n 10')
    print(stdout.read().decode().strip())
    
    print("\n=== CUPS Error Log (Last 30 lines) ===")
    stdin, stdout, stderr = c.exec_command('@SUDO@ cat /var/log/cups/error_log | tail -n 30')
    print(stdout.read().decode().strip())
    print(stderr.read().decode().strip())
    
except Exception as e:
    print("SSH Error:", e)
finally:
    c.close()
