import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("PAGE_LOG ALL RECENT", "echo printpi | sudo -S cat /var/log/cups/page_log | tail -n 30"),
    ("CONTROL FILE c01630", "echo printpi | sudo -S strings /var/spool/cups/c01630"),
    ("CONTROL FILE c01631", "echo printpi | sudo -S strings /var/spool/cups/c01631"),
    ("PDFINFO OF SPOOLED FILES", "echo printpi | sudo -S pdfinfo /var/spool/cups/d01630-001; echo printpi | sudo -S pdfinfo /var/spool/cups/d01631-001"),
    ("CHECK COMPLETED JOBS ATTRIBUTES (PYCUPS)", """python3 -c "
import cups
conn = cups.Connection()
jobs = conn.getJobs(which_jobs='completed', my_jobs=False)
print('Completed jobs:', list(jobs.keys())[-10:])
for jid in list(jobs.keys())[-5:]:
    try:
        attrs = conn.getJobAttributes(jid)
        print(f'Job {jid}: state={attrs.get(\"job-state\")} media-sheets={attrs.get(\"job-media-sheets-completed\")} impressions={attrs.get(\"job-impressions-completed\")} sides={attrs.get(\"sides\")} time={attrs.get(\"time-at-completed\")}')
    except Exception as e:
        print(f'Job {jid}: error {e}')
" """)
]

for title, cmd in commands:
    print(f"\n==================== {title} ====================")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out:
        print(out)
    if err:
        print("[STDERR]", err)

client.close()
