import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_epson():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.107.95.16', username='pi', password='printpi', timeout=15)
        print("Connected to pi@pi!")
        
        # 1. dmesg tail
        print("\n--- dmesg tail ---")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S dmesg | tail -n 30")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 2. lpstat -t
        print("\n--- lpstat -t ---")
        stdin, stdout, stderr = client.exec_command("lpstat -t")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 3. CUPS Error Log tail
        print("\n--- CUPS Error Log (last 30 lines) ---")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S tail -n 30 /var/log/cups/error_log")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_epson()
