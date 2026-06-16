const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no pi@pi "ls -la mimo-listener; ls -la mimo; ls -la"').toString());
} catch(e) {
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.log(e.stderr.toString());
}
