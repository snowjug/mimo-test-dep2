import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def test_print():
    client = new_client()
    try:
        connect(client, "CV-001", timeout=15)
        print("Connected to printpi!")
        
        # Upload test.pdf to Pi
        sftp = client.open_sftp()
        local_path = r'C:\Users\HP\Desktop\mimo-test-dep2\backend\test.pdf'
        remote_path = '/tmp/grid_test.pdf'
        print(f"Uploading {local_path} to {remote_path}...")
        sftp.put(local_path, remote_path)
        sftp.close()
        
        # Verify file size
        stdin, stdout, stderr = client.exec_command("ls -lh /tmp/grid_test.pdf")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # Print to native USB queue (Brother_HL_L5210DN_series)
        print("Printing to Brother_HL_L5210DN_series (NATIVE USB)...")
        stdin, stdout, stderr = client.exec_command("lp -d Brother_HL_L5210DN_series -n 1 -o media=A4 -o fit-to-page /tmp/grid_test.pdf")
        print("Native USB Queue Output:", stdout.read().decode('utf-8', errors='replace').strip())
        
        # Print to driverless queue (Brother_HL_L5210DN_series_USB)
        print("Printing to Brother_HL_L5210DN_series_USB (DRIVERLESS IPP)...")
        stdin, stdout, stderr = client.exec_command("lp -d Brother_HL_L5210DN_series_USB -n 1 -o media=A4 -o fit-to-page /tmp/grid_test.pdf")
        print("Driverless Queue Output:", stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    test_print()
