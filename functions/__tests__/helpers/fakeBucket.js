// In-memory stand-in for a Cloud Storage bucket (just what the cleanup code uses): file().delete / getMetadata / exists,
// getFiles({ prefix, maxResults, startOffset }) with name-ordered pages, and per-object failure injection.
//
//   const bucket = createFakeBucket({ "uploads/a/1.pdf": { created: "2026-01-01T00:00:00Z" } });
//   bucket.failDelete("uploads/a/1.pdf", 503)   // delete() will throw an error with that code until cleared
//   bucket.has(name) / bucket.names() / bucket.deleted   (names deleted so far, in order)
function createFakeBucket(seed = {}, { name = "test-bucket" } = {}) {
  const objects = new Map(Object.entries(seed).map(([n, o]) => [n, { timeCreated: new Date(o.created || o.timeCreated || "2026-01-01T00:00:00Z").toISOString(), size: o.size || 1000, generation: o.generation || 1 }]));
  const deleteFailures = new Map();
  const listFailures = [];
  const bucket = {
    name, deleted: [], deleteCalls: 0,
    put(n, created, size = 1000, generation) {
      const cur = objects.get(n);
      const nextGen = generation !== undefined ? generation : (cur ? (cur.generation || 1) + 1 : 1);
      objects.set(n, { timeCreated: new Date(created).toISOString(), size, generation: nextGen });
      return bucket;
    },
    has: (n) => objects.has(n),
    getGeneration: (n) => objects.has(n) ? objects.get(n).generation : null,
    clear() { objects.clear(); deleteFailures.clear(); listFailures.length = 0; bucket.deleted.length = 0; bucket.deleteCalls = 0; return bucket; },
    names: () => [...objects.keys()].sort(),
    failDelete(n, code = 503) { deleteFailures.set(n, code); return bucket; },
    clearFailures() { deleteFailures.clear(); listFailures.length = 0; return bucket; },
    failNextList(code = 503) { listFailures.push(code); return bucket; },
    file(n) {
      return {
        name: n,
        async delete(options = {}) {
          bucket.deleteCalls += 1;
          if (deleteFailures.has(n)) { const e = new Error(`fake storage error ${deleteFailures.get(n)}`); e.code = deleteFailures.get(n); throw e; }
          if (!objects.has(n)) { const e = new Error("No such object: " + n); e.code = 404; throw e; }
          if (options && options.ifGenerationMatch !== undefined && options.ifGenerationMatch !== null) {
            const currentGen = objects.get(n).generation;
            if (String(currentGen) !== String(options.ifGenerationMatch)) {
              const e = new Error("Precondition Failed");
              e.code = 412;
              e.status = 412;
              throw e;
            }
          }
          objects.delete(n); bucket.deleted.push(n);
        },
        async exists() { return [objects.has(n)]; },
        async getMetadata() {
          if (!objects.has(n)) { const e = new Error("Not Found"); e.code = 404; throw e; }
          const o = objects.get(n); return [{ name: n, timeCreated: o.timeCreated, size: String(o.size), generation: o.generation }];
        },
      };
    },
    async getFiles({ prefix = "", maxResults = 1000, startOffset } = {}) {
      if (listFailures.length) { const e = new Error("fake list failure"); e.code = listFailures.shift(); throw e; }
      let names = [...objects.keys()].filter((n) => n.startsWith(prefix)).sort();
      if (startOffset) names = names.filter((n) => n >= startOffset);
      const page = names.slice(0, maxResults).map((n) => ({
        name: n,
        generation: objects.get(n).generation,
        metadata: { timeCreated: objects.get(n).timeCreated, size: String(objects.get(n).size), generation: objects.get(n).generation }
      }));
      return [page, null, {}];
    },
  };
  return bucket;
}
module.exports = { createFakeBucket };
