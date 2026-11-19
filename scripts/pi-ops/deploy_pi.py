# Migrated from backend/deploy_pi.py: credentials and hosts now come from pi_config (env / pi-hosts.env). See README.md.
import pi_config as pi
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

LOCAL_LISTENER_PATH = str(pi.LISTENER_PATH)
LOCAL_CLEAN_PATH = str(pi.REPO_ROOT / "pi_scripts" / "clean_epson.py")

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
        print("Uploading scripts to pi...")
        sftp = client.open_sftp()
        sftp.put(LOCAL_LISTENER_PATH, '/home/pi/mimo/firebase_listener.py')
        if os.path.exists(LOCAL_CLEAN_PATH):
            sftp.put(LOCAL_CLEAN_PATH, '/home/pi/mimo/clean_epson.py')
        sftp.close()
        print("Uploaded scripts successfully to pi!")

        # 4. Remove automatic crontab for clean_epson if present
        stdin, stdout, stderr = client.exec_command("crontab -l")
        cron_content = stdout.read().decode('utf-8', errors='replace')
        if "clean_epson" in cron_content:
            new_cron = "\n".join([l for l in cron_content.splitlines() if "clean_epson" not in l]).strip() + "\n"
            sftp = client.open_sftp()
            with sftp.open("/home/pi/new_crontab.txt", "w") as f:
                f.write(new_cron)
            sftp.close()
            client.exec_command("crontab /home/pi/new_crontab.txt && rm -f /home/pi/new_crontab.txt")
            print("Removed legacy clean_epson from crontab.")

        # 5. Start mimo-listener on pi
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
