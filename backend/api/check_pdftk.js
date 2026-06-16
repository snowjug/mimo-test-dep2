const { execSync } = require('child_process');
try {
  console.log(execSync('ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 pi@pi "which pdftk qpdf"').toString());
} catch (e) {
  console.log("Error:", e.message);
  if (e.stdout) console.log(e.stdout.toString());
}
