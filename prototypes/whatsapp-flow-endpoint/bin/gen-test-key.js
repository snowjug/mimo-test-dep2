#!/usr/bin/env node
"use strict";
// Generates a THROWAWAY RSA-2048 test key pair for the local adapter.
//   node bin/gen-test-key.js <output-directory>
// Refuses to write inside this git repository (so a key cannot be committed by accident) and never overwrites.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = process.argv[2];
if (!dir) { console.error("usage: node bin/gen-test-key.js <output-directory outside the repository>"); process.exit(2); }
const out = path.resolve(dir);
let root = null;
try { root = execFileSync("git", ["-C", __dirname, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }
const inside = (p, r) => { const rel = path.relative(path.resolve(r), p); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
if (root && inside(out, root)) { console.error("refusing: output directory is inside the git repository. Choose a folder outside it."); process.exit(2); }

fs.mkdirSync(out, { recursive: true });
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const priv = path.join(out, "flowtest-private.pem");
const pub = path.join(out, "flowtest-public.pem");
try {
  fs.writeFileSync(priv, privateKey, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(pub, publicKey, { flag: "wx", mode: 0o644 });
} catch (e) { console.error(e.code === "EEXIST" ? "refusing to overwrite existing key files" : "cannot write key files"); process.exit(1); }
console.log(`wrote ${priv}\nwrote ${pub}\nTEST KEY ONLY - never use it for a real WhatsApp Business account.`);
