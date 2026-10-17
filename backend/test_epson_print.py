import paramiko
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "pi-ops"))
from pi_config import new_client, connect  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

def test_epson():
    client = new_client()
    try:
        connect(client, "SV-002", timeout=15)
        print("Connected to pi@pi!")
        
        # 1. Reset Epson USB port first to clear any stuck states
        print("Resetting Epson USB port...")
        client.exec_command("@SUDO@ usbreset 04b8:118a")
        import time
        time.sleep(3)
        
        # 2. Print to Epson_L3250
        print("Printing dummy_test.pdf to Epson_L3250...")
        stdin, stdout, stderr = client.exec_command("lp -d Epson_L3250 -n 1 -o media=A4 -o fit-to-page /tmp/dummy_test.pdf")
        print("Epson_L3250 Print Output:", stdout.read().decode('utf-8', errors='replace').strip())
        
        # 3. Print to L3250-Series
        print("Printing dummy_test.pdf to L3250-Series...")
        stdin, stdout, stderr = client.exec_command("lp -d L3250-Series -n 1 -o media=A4 -o fit-to-page /tmp/dummy_test.pdf")
        print("L3250-Series Print Output:", stdout.read().decode('utf-8', errors='replace').strip())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    test_epson()
