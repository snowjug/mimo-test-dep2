# Migrated from backend/deploy_pi.py: credentials and hosts now come from pi_config (env / pi-hosts.env). See README.md.
import pi_config as pi
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

LOCAL_LISTENER_PATH = str(pi.LISTENER_PATH)

def main():
    if not os.path.exists(LOCAL_LISTENER_PATH):
        print(f"Error: Local file not found at {LOCAL_LISTENER_PATH}")
        sys.exit(1)

    client = pi.new_client()
    try:
        # 1. Connect to pi (SV-002)
        print("Connecting to SV-002...")
        pi.connect(client, "SV-002", timeout=15)
        print("Connected to pi!")

        # 2. Stop mimo-listener on pi
        print("Stopping service on pi...")
        client.exec_command(f"@SUDO@ systemctl stop mimo-listener")

        # 3. SFTP upload to pi
        print("Uploading listener to pi...")
        sftp = client.open_sftp()
        sftp.put(LOCAL_LISTENER_PATH, '/home/pi/mimo/firebase_listener.py')
        sftp.close()
        print("Uploaded successfully to pi!")

        # 4. Start mimo-listener on pi
        print("Starting service on pi...")
        client.exec_command(f"@SUDO@ systemctl start mimo-listener")
        print("mimo-listener restarted on pi!")

        print("\n✅ Deployment completed successfully for SV-002!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    main()
