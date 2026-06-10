const { execSync } = require('child_process');
try {
  const output = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "ls -la /home/pi/mimo/downloads"');
  console.log(output.toString());
} catch(e) {
  console.log(e.message);
}
