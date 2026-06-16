const { execSync } = require('child_process');
try {
  const logs = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "journalctl -u mimo-listener.service --no-pager | tail -n 50"');
  console.log(logs.toString());
} catch(e) {
  console.log(e.message);
}
