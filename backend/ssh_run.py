import paramiko
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def main():
    if len(sys.argv) < 3:
        print("Usage: python ssh_run.py <pi|printpi> <command>")
        sys.exit(1)

    target = sys.argv[1]
    command = " ".join(sys.argv[2:])

    kiosk = "SV-002" if target == 'pi' else "CV-001"

    client = new_client()
    try:
        print(f"Connecting to {kiosk}...")
        connect(client, kiosk, timeout=15)
        print(f"Running command: {command}")
        stdin, stdout, stderr = client.exec_command(command)
        
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        
        if out.strip():
            print("--- STDOUT ---")
            print(out.strip())
        if err.strip():
            print("--- STDERR ---")
            print(err.strip())
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    main()
