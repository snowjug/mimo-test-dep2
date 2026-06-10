const { execSync } = require('child_process');
try {
  const output = execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "journalctl -u mimo-listener.service --no-pager | grep \'Failed to download\' -B 2 -A 5 | tail -n 30"');
  console.log(output.toString());
} catch(e) {
  console.log(e.message);
  if (e.stdout) console.log(e.stdout.toString());
}
