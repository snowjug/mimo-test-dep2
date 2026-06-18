import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_printpi():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('100.70.107.44', username='printpi', password='printpi', timeout=15)
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
