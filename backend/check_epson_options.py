import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def check_epson_options():
    client = new_client()
    try:
        connect(client, "SV-002", timeout=15)
        print("Connected!")
        
        # 1. lpoptions for Epson_L3250
        print("\n--- lpoptions -p Epson_L3250 -l ---")
        stdin, stdout, stderr = client.exec_command("lpoptions -p Epson_L3250 -l")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 2. lpoptions for L3250-Series
        print("\n--- lpoptions -p L3250-Series -l ---")
        stdin, stdout, stderr = client.exec_command("lpoptions -p L3250-Series -l")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_epson_options()
