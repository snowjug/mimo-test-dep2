import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def diagnose_sv002():
    client = new_client()
    try:
        connect(client, "SV-002", timeout=15)
        print("Connected to SV-002!")
        
        # 1. Print queue status
        print("\n--- lpstat -o ---")
        stdin, stdout, stderr = client.exec_command('lpstat -o')
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 2. Printer status
        print("\n--- lpstat -p ---")
        stdin, stdout, stderr = client.exec_command('lpstat -p')
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 3. CUPS Error Log (last 40 lines)
        print("\n--- CUPS Error Log (last 40 lines) ---")
        stdin, stdout, stderr = client.exec_command('echo "printpi" | sudo -S tail -n 40 /var/log/cups/error_log')
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 4. Listener service status
        print("\n--- Listener Service Status ---")
        stdin, stdout, stderr = client.exec_command('systemctl status mimo-listener --no-pager')
        print(stdout.read().decode('utf-8', errors='replace').strip())

    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    diagnose_sv002()
