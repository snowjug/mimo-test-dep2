import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def update_service():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.70.107.44', username='printpi', password='printpi', timeout=15)
        print("Connected to printpi!")
        
        # 1. Update the service file to use Brother_HL_L5210DN_series instead of Brother_HL_L5210DN_series_USB
        print("Updating mimo-listener.service on printpi...")
        cmd = "echo 'printpi' | sudo -S sed -i 's/Brother_HL_L5210DN_series_USB/Brother_HL_L5210DN_series/g' /etc/systemd/system/mimo-listener.service"
        stdin, stdout, stderr = client.exec_command(cmd)
        stdout.read()
        
        # 2. systemctl daemon-reload
        print("Running systemctl daemon-reload...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl daemon-reload")
        stdout.read()
        
        # 3. systemctl restart mimo-listener
        print("Restarting mimo-listener service...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl restart mimo-listener")
        stdout.read()
        
        # 4. Check service status
        print("Checking service status...")
        stdin, stdout, stderr = client.exec_command("systemctl status mimo-listener --no-pager")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        print("✅ printpi service updated successfully!")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    update_service()
