import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect('100.108.118.38', username='printpi', password='printpi', timeout=10)
    print("Connected to printpi")
    
    # Check if PyPDF2 is installed
    stdin, stdout, stderr = ssh.exec_command("python3 -c 'import PyPDF2; print(PyPDF2.__version__)'")
    print("PyPDF2:", stdout.read().decode().strip())
    print("PyPDF2 stderr:", stderr.read().decode().strip())
    
    # Check syslog for python errors
    stdin, stdout, stderr = ssh.exec_command("tail -n 100 /var/log/syslog | grep -i python")
    print("Syslog python errors:\n", stdout.read().decode().strip())
    
    ssh.close()
except Exception as e:
    print(f"SSH failed: {e}")
