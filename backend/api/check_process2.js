const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 pi@pi "ps aux | grep firebase_listener.py"').toString());
} catch (e) {
  console.log("Error:", e.message);
  if (e.stdout) console.log(e.stdout.toString());
}
