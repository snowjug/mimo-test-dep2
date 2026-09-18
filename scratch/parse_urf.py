import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.107.95.16', username='pi', password='printpi', timeout=20)

commands = [
    ("PARSE URF PAGES", """python3 -c "
with open('/tmp/clean_duplex.urf', 'rb') as f:
    data = f.read()

print('Total URF file size:', len(data))
magic = data[:8]
print('Magic:', magic)
import struct
total_pages_header = struct.unpack('>I', data[8:12])[0]
print('Header page count:', total_pages_header)

pos = 12
page_idx = 1
while pos < len(data):
    if pos + 32 > len(data):
        print(f'Remaining trailing bytes: {len(data) - pos} at {pos}')
        break
    # URF page header is 32 bytes (or rastertopwg format)
    # Let's inspect bytes at pos
    bpp = data[pos]
    colorspace = data[pos+1]
    duplex = data[pos+2]
    quality = data[pos+3]
    w, h, dpi = struct.unpack('>III', data[pos+4:pos+16])
    print(f'Page {page_idx}: bpp={bpp}, cs={colorspace}, duplex={duplex}, w={w}, h={h}, dpi={dpi} at offset {pos}')
    page_idx += 1
    # Move past header and scan for next page or end
    pos += 16
    # Let's see how much data until EOF
    break
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
