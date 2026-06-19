import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def configure_brother():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.107.95.16', username='pi', password='printpi', timeout=15)
        print("Connected to pi@pi!")
        
        # 1. Stop and disable ipp-usb
        print("Stopping and disabling ipp-usb...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl stop ipp-usb")
        stdout.read()
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl disable ipp-usb")
        stdout.read()
        
        # 2. Re-create the queue Brother_HL_L2440DW_series as a native USB queue using brlaser driver
        print("Re-creating Brother_HL_L2440DW_series print queue...")
        # Delete old queue first
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S lpadmin -x Brother_HL_L2440DW_series")
        stdout.read()
        
        # Create new queue
        uri = "usb://Brother/HL-L2440DW?serial=E82911A6N205524"
        ppd = "drv:///brlaser.drv/brl2400d.ppd"
        cmd = f"echo 'printpi' | sudo -S lpadmin -p Brother_HL_L2440DW_series -v '{uri}' -m '{ppd}' -E"
        stdin, stdout, stderr = client.exec_command(cmd)
        print("lpadmin Output:", stdout.read().decode('utf-8', errors='replace').strip())
        print("lpadmin Error:", stderr.read().decode('utf-8', errors='replace').strip())
        
        # 3. Enable the printer
        print("Enabling printer...")
        client.exec_command("echo 'printpi' | sudo -S cupsenable Brother_HL_L2440DW_series")
        client.exec_command("echo 'printpi' | sudo -S cupsaccept Brother_HL_L2440DW_series")
        
        # 4. Check printer status
        print("\n--- lpstat -p Brother_HL_L2440DW_series -l ---")
        stdin, stdout, stderr = client.exec_command("lpstat -p Brother_HL_L2440DW_series -l")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 5. Print a test page to verify
        print("\nPrinting /tmp/dummy_test.pdf to new native USB queue...")
        stdin, stdout, stderr = client.exec_command("lp -d Brother_HL_L2440DW_series -n 1 -o media=A4 -o fit-to-page /tmp/dummy_test.pdf")
        print("CUPS Print Output:", stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    configure_brother()
