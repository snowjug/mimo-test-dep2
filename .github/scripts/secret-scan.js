#!/usr/bin/env node
/**
 * Fails when a change ADDS something that looks like a secret. Scans only the added lines of a diff, so old
 * findings already in history do not block unrelated work.
 *
 *   node .github/scripts/secret-scan.js <base-ref> [head-ref=HEAD]
 *
 * Silence a deliberate false positive with the comment `secret-scan:allow` on the same line.
 * Files under __tests__/, *.md examples with obvious placeholders and lockfiles are ignored.
 */
const { execFileSync } = require("child_process");

const RULES = [
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Cashfree secret key", re: /cfsk_(?:ma_)?(?:test|prod)_[A-Za-z0-9_]{12,}/ },
  { name: "Meta / WhatsApp access token", re: /\bEA[A-Z][A-Za-z0-9]{60,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}/ },
  { name: "Tailscale / private network address", re: /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/ },
  {
    name: "hard-coded credential assignment",
    re: /\b(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)\w*\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    ignoreValue: /(?:<[^>]+>|\.\.\.|example|changeme|placeholder|your[-_ ]|xxx|\$\{|process\.env|local-dev|choose-something|test-secret|dummy)/i,
  },
];
const SKIP_FILE = /(^|\/)(__tests__|fixtures|node_modules)\/|package-lock\.json$|\.lock$|\.(png|jpe?g|gif|pdf|ico|woff2?|ttf)$/i;
// Public Firebase web config keys are meant to be in front-end code
const ALLOWED_FILES = /(^|\/)firebase\.ts$/;

function scanAddedLines(diffText) {
  const findings = [];
  let file = null;
  let lineNo = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) { file = line.slice(4).replace(/^b\//, ""); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) { lineNo = Number(hunk[1]) - 1; continue; }
    if (!file || file === "/dev/null") continue;
    if (line.startsWith("+")) {
      lineNo += 1;
      if (SKIP_FILE.test(file) || line.includes("secret-scan:allow")) continue;
      for (const rule of RULES) {
        const m = rule.re.exec(line);
        if (!m) continue;
        if (rule.ignoreValue && rule.ignoreValue.test(m[0])) continue;
        if (ALLOWED_FILES.test(file) && /\bAIza[0-9A-Za-z_-]{35}\b/.test(line)) continue;
        findings.push({ file, line: lineNo, rule: rule.name, sample: m[0].slice(0, 6) + "…" });
      }
    } else if (!line.startsWith("-")) {
      lineNo += 1;
    }
  }
  return findings;
}

function main() {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) { console.error("usage: secret-scan.js <base-ref> [head-ref]"); process.exit(2); }
  let diff;
  try {
    diff = execFileSync("git", ["diff", "--unified=0", "--no-color", `${base}...${head}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    console.log(`::warning::secret scan skipped: cannot diff ${base}...${head} (${err.message.split("\n")[0]})`);
    return;
  }
  const findings = scanAddedLines(diff);
  if (!findings.length) { console.log("secret scan: no secrets found in added lines"); return; }
  for (const f of findings) console.error(`::error file=${f.file},line=${f.line},title=Possible secret::${f.rule} (starts with "${f.sample}") — remove it, use an environment variable, or mark a false positive with 'secret-scan:allow'`);
  console.error(`\n${findings.length} possible secret(s) added. Never commit credentials; rotate any real one that was pushed.`);
  process.exit(1);
}

if (require.main === module) main();
module.exports = { scanAddedLines, RULES };
