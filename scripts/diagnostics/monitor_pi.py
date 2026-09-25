import paramiko
import time
import sys

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting to printpi...")
c.connect('100.70.107.44', username='printpi', password='printpi')
print("Connected. Tailing logs...")

# Tail the systemd journal for mimo-listener
stdin, stdout, stderr = c.exec_command('journalctl -u mimo-listener -f -n 0')

try:
    for line in iter(stdout.readline, ""):
        print(line, end="")
        sys.stdout.flush()
except KeyboardInterrupt:
    print("Exiting...")
finally:
    c.close()
