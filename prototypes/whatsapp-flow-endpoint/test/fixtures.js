"use strict";
// Synthetic fixtures only: generated RSA keys, test secrets, generated PDFs/PNGs. Nothing here is a real credential.
const crypto = require("crypto");
const zlib = require("zlib");
const http = require("http");
const path = require("path");
const { createRequire } = require("module");
const functionsRequire = createRequire(path.resolve(__dirname, "../../../functions/package.json"));
const { PDFDocument } = functionsRequire("pdf-lib");

const TEST_APP_SECRET = "test-app-secret-not-real";

function generateKeys() {
  return crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
}

/** Build a request exactly as Meta's documented format: RSA-OAEP(sha256) key + AES-128-GCM(payload)+tag. */
function buildEncryptedRequest(payload, publicKeyPem, { aesKey = crypto.randomBytes(16), iv = crypto.randomBytes(16) } = {}) {
  const encrypted_aes_key = crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aesKey).toString("base64");
  const c = crypto.createCipheriv("aes-128-gcm", aesKey, iv, { authTagLength: 16 });
  const enc = Buffer.concat([c.update(JSON.stringify(payload), "utf8"), c.final(), c.getAuthTag()]);
  return { body: { encrypted_aes_key, encrypted_flow_data: enc.toString("base64"), initial_vector: iv.toString("base64") }, aesKey, iv };
}

/** Independent response decryption written separately from src (manual bit flip) to avoid mirroring a bug. */
function decryptResponse(b64, aesKey, requestIv) {
  const flipped = Buffer.alloc(requestIv.length);
  for (let i = 0; i < requestIv.length; i++) flipped[i] = requestIv[i] ^ 0xff;
  const raw = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-128-gcm", aesKey, flipped, { authTagLength: 16 });
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString());
}

const sign = (rawBody, secret = TEST_APP_SECRET) => "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

/** Meta media format: AES-256-CBC(PKCS7) || first 10 bytes of HMAC-SHA256(hmacKey, iv||ciphertext). */
function encryptMedia(plain) {
  const key = crypto.randomBytes(32), hmacKey = crypto.randomBytes(32), iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-256-cbc", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  const mac = crypto.createHmac("sha256", hmacKey).update(iv).update(ct).digest().subarray(0, 10);
  const encrypted = Buffer.concat([ct, mac]);
  const h = (b) => crypto.createHash("sha256").update(b).digest("base64");
  return {
    encrypted,
    encryption_metadata: { encrypted_hash: h(encrypted), iv: iv.toString("base64"), encryption_key: key.toString("base64"), hmac_key: hmacKey.toString("base64"), plaintext_hash: h(plain) },
  };
}

async function makePdf(pages, { image } = {}) {
  const doc = await PDFDocument.create();
  const img = image ? await doc.embedPng(image) : null;
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Synthetic page ${i + 1}`, { x: 50, y: 780, size: 18 });
    if (img) p.drawImage(img, { x: 50, y: 300, width: 300, height: 400 });
  }
  return Buffer.from(await doc.save());
}

function crc32(buf) {
  let c, crc = ~0;
  for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function makePng(w, h, random = true) {
  const rows = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { rows[y * (w + 1)] = 0; if (random) crypto.randomFillSync(rows, y * (w + 1) + 1, w); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Loopback "CDN": serves encrypted blobs by path. */
function startFixtureCdn(blobs = {}) {
  const server = http.createServer((req, res) => {
    const blob = blobs[req.url];
    if (blob === undefined) { res.statusCode = 404; return res.end(); }
    res.statusCode = 200; res.setHeader("Content-Length", blob.length); res.end(blob);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    base: `http://127.0.0.1:${server.address().port}`, blobs, close: () => new Promise((r) => server.close(r)),
  })));
}

/** Register plaintext on the CDN and return the Flow media object. */
function addDocument(cdn, name, plain, tweak) {
  const m = encryptMedia(plain);
  const p = `/${crypto.randomBytes(6).toString("hex")}`;
  cdn.blobs[p] = tweak ? tweak(m.encrypted) : m.encrypted;
  return { media_id: p.slice(1), cdn_url: cdn.base + p, file_name: name, encryption_metadata: m.encryption_metadata };
}

/** In-memory stand-in for the Firestore read loadPricing performs (mimo_settings/pricing). */
const stubDb = (pricing = {}) => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => pricing }) }) }) });

module.exports = { TEST_APP_SECRET, generateKeys, buildEncryptedRequest, decryptResponse, sign, encryptMedia, makePdf, makePng, startFixtureCdn, addDocument, stubDb };
