import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("URF RAW HEADER HEX DUMP", """python3 -c "
with open('/tmp/clean_duplex.urf', 'rb') as f:
    data = f.read(64)
import binascii
print('Hex:', binascii.hexlify(data))
print('Length:', len(data))
for i in range(0, len(data), 16):
    chunk = data[i:i+16]
    hex_str = ' '.join(f'{b:02x}' for b in chunk)
    ascii_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
    print(f'{i:04x}:  {hex_str:<48}  {ascii_str}')
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
