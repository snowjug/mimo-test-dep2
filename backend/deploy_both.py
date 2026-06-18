import paramiko
import os
import sys
import base64
import time

sys.stdout.reconfigure(encoding='utf-8')

LOCAL_LISTENER_PATH = r"C:\Users\HP\Desktop\mimo-test-dep2\pi_scripts\firebase_listener.py"

def deploy_sv002_base64():
    print("\n=== Deploying via Base64 SSH to SV-002 (pi@100.107.95.16) ===")
    
    # Read and base64-encode local file
    with open(LOCAL_LISTENER_PATH, 'rb') as f:
        file_content = f.read()
    b64_content = base64.b64encode(file_content).decode('utf-8')
    print(f"Local file size: {len(file_content)} bytes. Base64 length: {len(b64_content)} chars.")
    
    REMOTE_B64_PATH = "/home/pi/mimo/firebase_listener.py.b64"
    REMOTE_PY_PATH = "/home/pi/mimo/firebase_listener.py"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.107.95.16', username='pi', password='printpi', timeout=15)
        print("Connected to SSH!")
        
        # Stop service
        print("Stopping mimo-listener service...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl stop mimo-listener")
        stdout.read()
        
        # Clear remote b64 file
        print("Clearing remote temp file...")
        stdin, stdout, stderr = client.exec_command(f"cat /dev/null > {REMOTE_B64_PATH}")
        stdout.read()
        
        # Upload in chunks of 1000 chars
        print("Uploading base64 chunks...")
        chunk_size = 1000
        total_chunks = (len(b64_content) + chunk_size - 1) // chunk_size
        
        for i in range(total_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, len(b64_content))
            chunk = b64_content[start:end]
            
            cmd = f"echo -n '{chunk}' >> {REMOTE_B64_PATH}"
            stdin, stdout, stderr = client.exec_command(cmd)
            err = stderr.read().decode('utf-8')
            if err:
                raise Exception(f"Failed at chunk {i+1}/{total_chunks}: {err}")
            
            if (i + 1) % 50 == 0 or i + 1 == total_chunks:
                print(f"Sent chunk {i+1}/{total_chunks}")
            time.sleep(0.005)
            
        print("Base64 upload finished. Decoding on remote...")
        stdin, stdout, stderr = client.exec_command(f"base64 -d {REMOTE_B64_PATH} > {REMOTE_PY_PATH}")
        err = stderr.read().decode('utf-8')
        if err:
            raise Exception(f"Failed decoding base64: {err}")
        
        # Verify remote file size
        stdin, stdout, stderr = client.exec_command(f"wc -c {REMOTE_PY_PATH}")
        remote_size_out = stdout.read().decode('utf-8').strip()
        print(f"Remote file size verified: {remote_size_out}")
        
        # Remove temp b64 file
        stdin, stdout, stderr = client.exec_command(f"rm {REMOTE_B64_PATH}")
        stdout.read()
        
        # Start service
        print("Starting mimo-listener service...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl start mimo-listener")
        stdout.read()
        
        # Check status
        print("Checking service status...")
        stdin, stdout, stderr = client.exec_command("systemctl status mimo-listener --no-pager")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        print("✅ SV-002 (pi) Deployment Successful!")
        
    except Exception as e:
        print(f"❌ SV-002 Deployment failed: {e}")
    finally:
        client.close()

def deploy_cv001_sftp():
    print("\n=== Deploying via SFTP to CV-001 (printpi@100.70.107.44) ===")
    
    REMOTE_PY_PATH = "/home/printpi/firebase_listener.py"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.70.107.44', username='printpi', password='printpi', timeout=15)
        print("Connected to SSH!")
        
        # Stop service
        print("Stopping mimo-listener service...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl stop mimo-listener")
        stdout.read()
        
        # Upload via SFTP
        print("Uploading listener script...")
        sftp = client.open_sftp()
        sftp.put(LOCAL_LISTENER_PATH, REMOTE_PY_PATH)
        sftp.close()
        print("Upload completed!")
        
        # Start service
        print("Starting mimo-listener service...")
        stdin, stdout, stderr = client.exec_command("echo 'printpi' | sudo -S systemctl start mimo-listener")
        stdout.read()
        
        # Check status
        print("Checking service status...")
        stdin, stdout, stderr = client.exec_command("systemctl status mimo-listener --no-pager")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        print("✅ CV-001 (printpi) Deployment Successful!")
        
    except Exception as e:
        print(f"❌ CV-001 Deployment failed: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    if not os.path.exists(LOCAL_LISTENER_PATH):
        print(f"Error: Local file not found at {LOCAL_LISTENER_PATH}")
        sys.exit(1)
        
    deploy_sv002_base64()
    deploy_cv001_sftp()
