const { execSync } = require('child_process');
try {
  const output = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "cat /home/pi/mimo/firebase_listener.py"');
  require('fs').writeFileSync('firebase_listener_kiosk2.py', output);
  console.log('Downloaded to firebase_listener_kiosk2.py');
} catch(e) {
  console.log(e.message);
}
