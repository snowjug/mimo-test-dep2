// Shared fixtures for the storage-lifecycle tests: an in-memory Firestore + bucket, a fixed clock and small builders.
// No real Firebase, Storage, payment or printer is ever touched.
const { createFakeFirestore } = require("./fakeFirestore");
const { createFakeBucket } = require("./fakeBucket");

const BUCKET = "test-bucket";
const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const HOUR = 3600e3;
const ago = (ms) => new Date(NOW - ms).toISOString();

function createHarness() {
  const fake = createFakeFirestore();
  fake.install();
  const bucket = createFakeBucket({}, { name: BUCKET });
  fake.admin.storage = () => ({ bucket: () => bucket });
  const url = (p) => `https://storage.googleapis.com/${BUCKET}/${p}`;
  const fbUrl = (p) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(p)}?alt=media&token=t0k3n`;
  const h = {
    fake, bucket, NOW, HOUR, ago, url, fbUrl,
    db: fake.db, admin: fake.admin,
    config: (over = {}) => ({ retentionMs: 24 * HOUR, jobPageSize: 300, jobMaxScanned: 1500, jobMaxCleaned: 150, orphanPageSize: 250, orphanMaxScanned: 1000, deleteConcurrency: 3, timeBudgetMs: 1e9, orphanMode: "delete", ...over }),
    silent: { log() {}, error() {}, warn() {} },
    /** empty Firestore and bucket between tests */
    reset(seed = {}) { fake.reset(seed); bucket.clear(); bucket.name = BUCKET; },
    /**
     * Creates a print job document. `objects` maps object name -> age in hours; every object is created in the bucket.
     * The first object becomes fileUrl, the second convertedStoragePath (the shape finalize-upload writes).
     */
    async addJob(id, { status = "pending", objects = {}, files = null, extra = {} } = {}) {
      const names = Object.keys(objects);
      for (const [n, ageH] of Object.entries(objects)) bucket.put(n, ago(ageH * HOUR));
      const doc = { userId: "u1", status, fileName: "x.pdf", ...(names[0] ? { fileUrl: url(names[0]) } : {}), ...extra };
      if (names[1]) doc.convertedStoragePath = names[1];
      if (files) doc.files = files.map((n) => ({ name: n, url: url(n) }));
      await fake.db.collection("print_jobs").doc(id).set(doc);
      return doc;
    },
    job: (id) => fake.data("print_jobs")[id],
    state: (id) => fake.data("system_state")[id],
  };
  return h;
}
module.exports = { createHarness, BUCKET, NOW, HOUR, ago };
