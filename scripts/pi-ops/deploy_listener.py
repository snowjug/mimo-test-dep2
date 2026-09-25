import paramiko
import sys

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    c.connect('printpi', username='printpi', password='printpi')
    
    print("Stopping mimo-listener service...")
    c.exec_command('sudo systemctl stop mimo-listener')
    
    print("Downloading updated listener directly from GitHub...")
    cmd = "curl -H 'Cache-Control: no-cache, no-store' -sL https://raw.githubusercontent.com/madhans7/mimo-test-dep2/main/pi_scripts/firebase_listener.py > /home/printpi/firebase_listener.py"
    stdin, stdout, stderr = c.exec_command(cmd)
    
    err = stderr.read().decode()
    if err:
        print("Error downloading:", err)
    
    print("Restarting mimo-listener service...")
    stdin, stdout, stderr = c.exec_command('sudo systemctl start mimo-listener')
    print("Done!")
finally:
    c.close()
