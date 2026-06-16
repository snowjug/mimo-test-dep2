const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no pi@pi "lpstat -p"').toString());
} catch(e) {
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.log(e.stderr.toString());
}
