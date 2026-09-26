# Migrated from backend/check_printpi_jobs.py: credentials and hosts now come from pi_config (env / pi-hosts.env). See README.md.
import pi_config as pi
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_printpi():
    client = pi.new_client()
    try:
        pi.connect(client, "CV-001", timeout=15)
        print("Connected!")
        
        # 1. Check active queues
        stdin, stdout, stderr = client.exec_command('lpstat -o')
        print("Active Jobs:")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 2. Get recent completed jobs
        print("\nRecent Completed Jobs:")
        stdin, stdout, stderr = client.exec_command('lpstat -W completed | head -n 10')
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        # 3. Check printer statuses
        print("\nPrinter statuses:")
        stdin, stdout, stderr = client.exec_command('lpstat -p')
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_printpi()
