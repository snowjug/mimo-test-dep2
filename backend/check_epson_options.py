import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_epson_options():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.107.95.16', username='pi', password='printpi', timeout=15)
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
