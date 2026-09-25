import paramiko
import sys

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    c.connect('100.70.107.44', username='printpi', password='printpi', timeout=10)
    
    print("=== Printer Status ===")
    stdin, stdout, stderr = c.exec_command('lpstat -p Epson_L3250')
    print(stdout.read().decode().strip())
    
    print("\n=== Completed Jobs ===")
    stdin, stdout, stderr = c.exec_command('lpstat -W completed | head -n 10')
    print(stdout.read().decode().strip())
    
    print("\n=== CUPS Error Log (Last 30 lines) ===")
    stdin, stdout, stderr = c.exec_command('sudo cat /var/log/cups/error_log | tail -n 30')
    print(stdout.read().decode().strip())
    print(stderr.read().decode().strip())
    
except Exception as e:
    print("SSH Error:", e)
finally:
    c.close()
