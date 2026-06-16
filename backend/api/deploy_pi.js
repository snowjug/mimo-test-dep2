const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no pi@pi "cd mimo; git pull origin main; sudo systemctl restart mimo-listener.service"').toString());
} catch(e) {
  console.log("Error", e.message);
  if(e.stdout) console.log(e.stdout.toString());
  if(e.stderr) console.log(e.stderr.toString());
}
