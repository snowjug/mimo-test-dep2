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
    """Deploy to SV-002 (pi@192.168.8.197) via CV-001 (printpi@100.70.107.44) jump."""
    print("\n" + "="*60)
    print("=== DEPLOYING TO SV-002 (pi@192.168.8.197) VIA CV-001 ===")
    print("="*60)

    cv_client = paramiko.SSHClient()
    cv_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting to CV-001 (100.70.107.44)...")
        cv_client.connect('100.70.107.44', username='printpi', password='printpi', timeout=15)
        print("✅ SSH connected to CV-001")

        print("Uploading listener to CV-001 temporary path...")
        sftp = cv_client.open_sftp()
        with sftp.open('/home/printpi/firebase_listener.py.sv002', 'w') as f:
            with open(LOCAL_LISTENER_PATH, 'r', encoding='utf-8') as lf:
                f.write(lf.read())
        sftp.close()
        print("✅ Uploaded to CV-001")

        print("Stopping and disabling ipp-usb service on SV-002...")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S systemctl stop ipp-usb\"")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S systemctl disable ipp-usb\"")

        print("Enabling printers on SV-002...")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S cupsenable Brother_HL_L2440DW_series\"")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S cupsaccept Brother_HL_L2440DW_series\"")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S cupsenable Epson_L3250\"")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S cupsaccept Epson_L3250\"")

        print("Stopping mimo-listener on SV-002...")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S systemctl stop mimo-listener\"")
        time.sleep(2)

        print("Copying listener from CV-001 to SV-002...")
        run_ssh(cv_client, "scp -o StrictHostKeyChecking=no /home/printpi/firebase_listener.py.sv002 pi@192.168.8.197:/home/pi/mimo/firebase_listener.py")

        print("Starting mimo-listener on SV-002...")
        run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"echo 'printpi' | sudo -S systemctl start mimo-listener\"")
        time.sleep(3)

        print("Service status on SV-002:")
        out, _ = run_ssh(cv_client, "ssh -o StrictHostKeyChecking=no pi@192.168.8.197 \"systemctl status mimo-listener --no-pager | head -20\"")
        print(out)

        print("Cleaning up temporary file on CV-001...")
        run_ssh(cv_client, "rm -f /home/printpi/firebase_listener.py.sv002")

        print("\n✅ SV-002 deployment successful!")

    except Exception as e:
        print(f"❌ SV-002 deployment failed: {e}")
    finally:
        cv_client.close()


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
Environment=BW_PRINTER_NAME=Brother_HL_L5210DN_series
Environment=COLOR_PRINTER_NAME=Brother_HL_L5210DN_series
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

        print("Stopping and disabling ipp-usb service on CV-001...")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl stop ipp-usb")
        run_ssh(client, "echo 'printpi' | sudo -S systemctl disable ipp-usb")

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
