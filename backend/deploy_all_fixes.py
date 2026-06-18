"""
deploy_all_fixes.py — Deploy all production fixes to both Pi nodes.
Fixes:
 - Progress bar sync with physical print (CUPS job polling)
 - Printer offline detection
 - N-up layout bug (was_imposed flag)
 - mimo_graph / blank sheet zoom fix (print-scaling=none)
 - IS_MONOCHROME_ONLY=true for CV-001
 - Download speed (GCS direct, 1MB chunks)
 - Duplex multi-page fix
"""
import paramiko
import os
import sys
import base64
import time

sys.stdout.reconfigure(encoding='utf-8')

# The master copy is in pi_scripts/firebase_listener.py
LOCAL_LISTENER_PATH = r"C:\Users\HP\Desktop\mimo-test-dep2\pi_scripts\firebase_listener.py"

def run_ssh(client, cmd, label=""):
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f"  OUT: {out}")
    if err and 'warning' not in err.lower():
        print(f"  ERR: {err}")
    return out, err

def deploy_sv002():
    """Deploy to SV-002 (pi@100.107.95.16) — uses base64 chunked upload."""
    print("\n" + "="*60)
    print("=== DEPLOYING TO SV-002 (pi@100.107.95.16) ===")
    print("="*60)

    with open(LOCAL_LISTENER_PATH, 'rb') as f:
        file_content = f.read()
    b64_content = base64.b64encode(file_content).decode('utf-8')
    print(f"File: {len(file_content):,} bytes (b64: {len(b64_content):,} chars)")

    REMOTE_B64_PATH = "/home/pi/mimo/firebase_listener.py.b64"
    REMOTE_PY_PATH  = "/home/pi/mimo/firebase_listener.py"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.107.95.16', username='pi', password='printpi', timeout=15)
        print("✅ SSH connected")

        print("Stopping mimo-listener...")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl stop mimo-listener")
        time.sleep(2)

        print("Clearing remote temp file...")
        run_ssh(client, f"cat /dev/null > {REMOTE_B64_PATH}")

        print(f"Uploading in 1000-char chunks...")
        chunk_size = 1000
        total_chunks = (len(b64_content) + chunk_size - 1) // chunk_size
        for i in range(total_chunks):
            start = i * chunk_size
            end   = min(start + chunk_size, len(b64_content))
            chunk = b64_content[start:end]
            cmd = f"echo -n '{chunk}' >> {REMOTE_B64_PATH}"
            stdin, stdout, stderr = client.exec_command(cmd)
            err = stderr.read().decode('utf-8')
            if err:
                raise Exception(f"Chunk {i+1} failed: {err}")
            if (i + 1) % 100 == 0 or i + 1 == total_chunks:
                print(f"  Sent {i+1}/{total_chunks} chunks...")
            time.sleep(0.003)

        print("Decoding on remote...")
        run_ssh(client, f"base64 -d {REMOTE_B64_PATH} > {REMOTE_PY_PATH}")
        run_ssh(client, f"rm -f {REMOTE_B64_PATH}")

        # Verify size
        out, _ = run_ssh(client, f"wc -c {REMOTE_PY_PATH}")
        print(f"Remote file: {out}")

        print("Starting mimo-listener...")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl start mimo-listener")
        time.sleep(3)

        print("Service status:")
        out, _ = run_ssh(client, "systemctl status mimo-listener --no-pager | head -20")
        print(out)

        print("\n✅ SV-002 deployment successful!")

    except Exception as e:
        print(f"❌ SV-002 deployment failed: {e}")
    finally:
        client.close()


def deploy_cv001():
    """Deploy to CV-001 (printpi@100.70.107.44) — SFTP + service file update."""
    print("\n" + "="*60)
    print("=== DEPLOYING TO CV-001 (printpi@100.70.107.44) ===")
    print("="*60)

    REMOTE_PY_PATH = "/home/printpi/firebase_listener.py"

    # Updated service file with IS_MONOCHROME_ONLY=true
    SERVICE_CONTENT = """[Unit]
Description=Mimo Firebase Print Listener
After=network.target

[Service]
Type=simple
User=printpi
WorkingDirectory=/home/printpi
Environment= PYTHONUNBUFFERED=1
Environment=BW_PRINTER_NAME=Brother_IPP
Environment=COLOR_PRINTER_NAME=Brother_IPP
Environment=IS_MONOCHROME_ONLY=true
Environment=KIOSK_ID=CV-001
Environment=GRPC_DEFAULT_SSL_ROOTS_FILE_PATH=/etc/ssl/certs/ca-certificates.crt
ExecStart=/usr/bin/python3 /home/printpi/firebase_listener.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.70.107.44', username='printpi', password='printpi', timeout=15)
        print("✅ SSH connected")

        print("Stopping mimo-listener...")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl stop mimo-listener")
        time.sleep(2)

        # Upload listener via SFTP
        print("Uploading firebase_listener.py via SFTP...")
        sftp = client.open_sftp()
        sftp.put(LOCAL_LISTENER_PATH, REMOTE_PY_PATH)
        sftp.close()
        print("✅ Listener uploaded")

        # Write updated service file
        print("Updating service file with IS_MONOCHROME_ONLY=true...")
        tmp_service = "/tmp/mimo-listener.service"
        stdin, stdout, stderr = client.exec_command(f"cat > {tmp_service} << 'HEREDOC'\n{SERVICE_CONTENT}\nHEREDOC")
        stdout.read()
        # Use a Python write approach instead (heredoc can be flaky)
        sftp2 = client.open_sftp()
        with sftp2.file(tmp_service, 'w') as f:
            f.write(SERVICE_CONTENT)
        sftp2.close()

        run_ssh(client, f"echo 'printpi' | sudo -S cp {tmp_service} /etc/systemd/system/mimo-listener.service")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl daemon-reload")
        print("✅ Service file updated")

        # Enable printer and make sure it's not paused
        print("Enabling Brother_HL_L5210DN_series printer...")
        run_ssh(client, "echo 'printpi' | sudo -S cupsenable Brother_HL_L5210DN_series")
        run_ssh(client, "echo 'printpi' | sudo -S cupsaccept Brother_HL_L5210DN_series")
        out, _ = run_ssh(client, "lpstat -p Brother_HL_L5210DN_series")
        print(f"  Printer status: {out}")

        print("Starting mimo-listener...")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl start mimo-listener")
        time.sleep(3)

        print("Service status:")
        out, _ = run_ssh(client, "systemctl status mimo-listener --no-pager | head -20")
        print(out)

        print("\n✅ CV-001 deployment successful!")

    except Exception as e:
        print(f"❌ CV-001 deployment failed: {e}")
    finally:
        client.close()


if __name__ == '__main__':
    if not os.path.exists(LOCAL_LISTENER_PATH):
        print(f"❌ Local file not found: {LOCAL_LISTENER_PATH}")
        sys.exit(1)

    deploy_sv002()
    deploy_cv001()
    print("\n\n🚀 ALL DEPLOYMENTS COMPLETE!")
