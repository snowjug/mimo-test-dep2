import re
with open('/home/pi/mimo/firebase_listener.py', 'r') as f:
    content = f.read()

replacement = '''
        # Ensure printer is enabled before pre-flight
        import time
        subprocess.run(["sudo", "cupsenable", printer_name], capture_output=True)
        time.sleep(1)

        # Pre-flight check
        status_cmd = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True)
        if "disabled" in status_cmd.stdout.lower() or "unplugged" in status_cmd.stdout.lower():
            # Try one more time
            time.sleep(4)
            subprocess.run(["sudo", "cupsenable", printer_name], capture_output=True)
            status_cmd = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True)
            if "disabled" in status_cmd.stdout.lower() or "unplugged" in status_cmd.stdout.lower():
                raise Exception(f"Pre-flight failed: Printer {printer_name} is offline or unplugged.")
'''

old_str = '''        # Pre-flight check
        status_cmd = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True)
        if "disabled" in status_cmd.stdout.lower() or "unplugged" in status_cmd.stdout.lower():
            raise Exception(f"Pre-flight failed: Printer {printer_name} is offline or unplugged.")'''

if old_str in content:
    content = content.replace(old_str, replacement)
    with open('/home/pi/mimo/firebase_listener.py', 'w') as f:
        f.write(content)
    print("Patch applied successfully")
else:
    print("Could not find exact string to patch")
