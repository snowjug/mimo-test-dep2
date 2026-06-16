const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no pi@100.107.95.16 "sudo journalctl -u mimo-listener.service -n 100 --no-pager"').toString());
} catch(e) {
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.log(e.stderr.toString());
  console.log(e.message);
}
