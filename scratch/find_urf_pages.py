import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("FIND ALL URF PAGE HEADERS", """python3 -c "
with open('/tmp/clean_duplex.urf', 'rb') as f:
    data = f.read()

import struct
print('Total file size:', len(data))
# Scan for URF page headers
# Each page starts with: bpp(1), cs(1), duplex(1), quality(1), ... w(4), h(4), dpi(4)
# In our file, w=2480 (0x9b0), h=3507 (0xdb3), dpi=300 (0x12c)
pattern = struct.pack('>III', 2480, 3507, 300)
pos = 0
matches = []
while True:
    pos = data.find(pattern, pos)
    if pos == -1: break
    # header starts 12 bytes before (offset 12 = 0x0c before resolution/w/h block)
    header_start = pos - 12
    matches.append(header_start)
    pos += 1

print('Found page headers at offsets:', matches)
for i, h_start in enumerate(matches, 1):
    header = data[h_start:h_start+32]
    bpp, cs, duplex, qual = header[0], header[1], header[2], header[3]
    w = struct.unpack('>I', header[12:16])[0]
    h = struct.unpack('>I', header[16:20])[0]
    dpi = struct.unpack('>I', header[20:24])[0]
    print(f'Page {i} (offset {h_start}): bpp={bpp}, cs={cs}, duplex_mode={duplex}, quality={qual}, {w}x{h} @ {dpi} DPI')
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
