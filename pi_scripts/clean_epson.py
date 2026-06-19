import subprocess
import os
import sys
from datetime import datetime

# Log file path
LOG_FILE = "/home/pi/mimo/clean_epson.log"

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {msg}\n"
    print(log_line.strip())
    try:
        with open(LOG_FILE, "a") as f:
            f.write(log_line)
    except:
        pass

def main():
    log("=== Starting Epson Auto-Clean ===")
    
    # 1. Check if printer is busy with active jobs
    try:
        res = subprocess.run(["lpstat", "-o", "Epson_L3250"], capture_output=True, text=True, timeout=10)
        if "Epson_L3250-" in res.stdout:
            log("⚠️ Printer is currently busy with active jobs. Skipping cleaning to avoid interruption.")
            sys.exit(0)
    except Exception as e:
        log(f"⚠️ Warning: Failed to check printer status: {e}")

    # 2. Generate raw ESC/P head-clean bytes
    # Enter remote mode, run CH command, exit remote mode
    raw_data = b'\x1b(R\x08\x00\x00REMOTE1' + b'CH\x02\x00\x00\x00' + b'\x1b\x00\x00\x00'
    
    temp_file = "/tmp/clean_head.bin"
    try:
        with open(temp_file, "wb") as f:
            f.write(raw_data)
            
        log("Submitting raw head cleaning job to CUPS...")
        res2 = subprocess.run(["lp", "-d", "Epson_L3250", "-o", "raw", temp_file], capture_output=True, text=True, timeout=15)
        
        if res2.returncode == 0:
            log(f"✅ Success: {res2.stdout.strip()}")
        else:
            log(f"❌ Failed to submit CUPS job: {res2.stderr.strip()}")
            
    except Exception as e:
        log(f"❌ Error during cleaning: {e}")
    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass
                
    log("=== Epson Auto-Clean Finished ===")

if __name__ == "__main__":
    main()
