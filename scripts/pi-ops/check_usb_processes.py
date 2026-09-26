# Migrated from backend/check_usb_processes.py: credentials and hosts now come from pi_config (env / pi-hosts.env). See README.md.
import pi_config as pi
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_processes():
    client = pi.new_client()
    try:
        pi.connect(client, "SV-002", timeout=15)
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
