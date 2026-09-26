# Migrated from backend/ssh_run.py: credentials and hosts now come from pi_config (env / pi-hosts.env). See README.md.
import pi_config as pi
import sys

sys.stdout.reconfigure(encoding='utf-8')

ALIASES = {"PI": "SV-002", "PRINTPI": "CV-001"}  # old names of the two machines


def main():
    if len(sys.argv) < 3:
        print("Usage: python ssh_run.py <CV-001|SV-002> <command>   (commands may use @SUDO@ for sudo)")
        sys.exit(1)

    target = ALIASES.get(sys.argv[1].upper(), sys.argv[1].upper())
    command = " ".join(sys.argv[2:])

    client = pi.new_client()
    try:
        print(f"Connecting to {target}...")
        pi.connect(client, target, timeout=15)
        print(f"Running command: {command}")
        stdin, stdout, stderr = client.exec_command(command)
        
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        
        if out.strip():
            print("--- STDOUT ---")
            print(out.strip())
        if err.strip():
            print("--- STDERR ---")
            print(err.strip())
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    main()
