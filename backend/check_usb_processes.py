import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def check_processes():
    client = new_client()
    try:
        connect(client, "SV-002", timeout=15)
        print("Connected to pi@pi!")
        
        # List all running cups/usb processes
        print("\n--- ps aux | grep -E 'cups|usb|lp' ---")
        stdin, stdout, stderr = client.exec_command("ps aux | grep -E 'cups|usb|lp' | grep -v grep")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_processes()
