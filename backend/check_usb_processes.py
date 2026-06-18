import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_processes():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.107.95.16', username='pi', password='printpi', timeout=15)
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
