import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def check_epson():
    client = new_client()
    try:
        connect(client, "SV-002", timeout=15)
        print("Connected to pi@pi!")
        
        # 1. dmesg tail
        print("\n--- dmesg tail ---")
        stdin, stdout, stderr = client.exec_command("@SUDO@ dmesg | tail -n 30")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 2. lpstat -t
        print("\n--- lpstat -t ---")
        stdin, stdout, stderr = client.exec_command("lpstat -t")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 3. CUPS Error Log tail
        print("\n--- CUPS Error Log (last 30 lines) ---")
        stdin, stdout, stderr = client.exec_command("@SUDO@ tail -n 30 /var/log/cups/error_log")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_epson()
