const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "cat /etc/systemd/system/mimo-listener.service"').toString());
} catch(e) {
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.log(e.stderr.toString());
  console.log(e.message);
}
