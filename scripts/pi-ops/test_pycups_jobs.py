import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

py_script = """import cups
conn = cups.Connection()

print('=== CHECKING JOB 1612 VIA PYCUPS ===')
try:
    attrs = conn.getJobAttributes(1612)
    print('attrs:', attrs)
except Exception as e:
    print('getJobAttributes error:', e)

try:
    c_jobs = conn.getJobs(which_jobs='completed', my_jobs=False)
    print('completed jobs in dict:', 1612 in c_jobs, type(c_jobs), list(c_jobs.keys())[:10] if isinstance(c_jobs, dict) else c_jobs[:10])
except Exception as e:
    print('getJobs completed error:', e)

try:
    a_jobs = conn.getJobs(which_jobs='all', my_jobs=False)
    print('all jobs in dict:', 1612 in a_jobs, list(a_jobs.keys())[:10] if isinstance(a_jobs, dict) else a_jobs[:10])
except Exception as e:
    print('getJobs all error:', e)

try:
    not_c = conn.getJobs(which_jobs='not-completed', my_jobs=False)
    print('not-completed jobs:', not_c)
except Exception as e:
    print('not-completed error:', e)
"""

sftp = client.open_sftp()
with sftp.file('/tmp/test_pycups.py', 'w') as f:
    f.write(py_script)
sftp.close()

stdin, stdout, stderr = client.exec_command('/home/pi/mimo/venv/bin/python /tmp/test_pycups.py')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print("STDOUT:\n", out)
if err:
    print("STDERR:\n", err)

client.close()
