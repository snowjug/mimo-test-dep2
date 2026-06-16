const { execSync } = require('child_process');
const fs = require('fs');

try {
  const listener = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "cat /home/pi/mimo/firebase_listener.py"');
  fs.writeFileSync('kiosk2_listener.py', listener);
  
  const downloads = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "ls -la /home/pi/mimo/downloads"');
  fs.writeFileSync('kiosk2_downloads.txt', downloads);
  
  const logs = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "journalctl -u mimo-listener.service --no-pager | tail -n 200"');
  fs.writeFileSync('kiosk2_recent_logs.txt', logs);

  console.log('Success');
} catch(e) {
  console.log('Error:', e.message);
  if (e.stdout) console.log('Stdout:', e.stdout.toString());
  if (e.stderr) console.log('Stderr:', e.stderr.toString());
}
