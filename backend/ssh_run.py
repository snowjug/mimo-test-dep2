import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def main():
    if len(sys.argv) < 3:
        print("Usage: python ssh_run.py <pi|printpi> <command>")
        sys.exit(1)
        
    target = sys.argv[1]
    command = " ".join(sys.argv[2:])
    
    host = '100.107.95.16' if target == 'pi' else '100.70.107.44'
    user = 'pi' if target == 'pi' else 'printpi'
    password = 'printpi'
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print(f"Connecting to {user}@{host}...")
        client.connect(host, username=user, password=password, timeout=15)
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
