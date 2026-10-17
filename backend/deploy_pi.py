import paramiko
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

LOCAL_LISTENER_PATH = r"C:\Users\HP\Desktop\mimo-test-dep2\pi_scripts\firebase_listener.py"

def main():
    if not os.path.exists(LOCAL_LISTENER_PATH):
        print(f"Error: Local file not found at {LOCAL_LISTENER_PATH}")
        sys.exit(1)

    client = new_client()
    try:
        # 1. Connect to pi (SV-002)
        print("Connecting to pi@100.107.95.16...")
        connect(client, "SV-002", timeout=15)
        print("Connected to pi!")

        # 2. Stop mimo-listener on pi
        print("Stopping service on pi...")
        client.exec_command("@SUDO@ systemctl stop mimo-listener")

        # 3. SFTP upload to pi
        print("Uploading listener to pi...")
        sftp = client.open_sftp()
        sftp.put(LOCAL_LISTENER_PATH, '/home/pi/mimo/firebase_listener.py')
        sftp.close()
        print("Uploaded successfully to pi!")

        # 4. Start mimo-listener on pi
        print("Starting service on pi...")
        client.exec_command("@SUDO@ systemctl start mimo-listener")
        print("mimo-listener restarted on pi!")

        print("\n✅ Deployment completed successfully for SV-002!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    main()
