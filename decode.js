const fs = require('fs');

let raw = fs.readFileSync('restored_from_write_135.html', 'utf-8');

// If it starts with " and ends with "
if (raw.startsWith('"')) {
  raw = raw.substring(1);
}
if (raw.endsWith('"')) {
  raw = raw.substring(0, raw.length - 1);
}

// Unescape literal \n, \", and \\
let decoded = raw
  .replace(/\\n/g, '\n')
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, '\\');

fs.writeFileSync('company-website/index.html', decoded);
fs.writeFileSync('mimo-website/public/landing.html', decoded);
console.log('Successfully decoded string manually.');
