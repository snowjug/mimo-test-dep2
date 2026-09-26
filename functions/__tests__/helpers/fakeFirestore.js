// A small in-memory stand-in for Firestore + firebase-admin, for tests that need real query semantics
// (where / limit / dotted-path updates / batches / transactions) without a database.
//
// Usage:
//   const fake = createFakeFirestore({ orders: { o1: { orderId: "order_1", amount: 25 } } });
//   require.cache[require.resolve("../src/config/firebase")] = { ..., exports: { admin: fake.admin, db: fake.db } };
//   fake.reset({ ... })   // between tests: same objects, fresh data (modules capture { db, admin } once at import)
//   fake.data("orders")   // -> { o1: {...} } plain snapshot of a collection
//   fake.log              // { writes: [...], reads: number } every write in order, for assertions
//
// Supported: collection().doc(id?) / add / where(==,!=,<,<=,>,>=,in,not-in,array-contains) / orderBy / limit / get,
// doc get/set(merge)/update(dotted paths)/create(ALREADY_EXISTS -> code 6)/delete, batch, runTransaction,
// FieldValue.serverTimestamp / increment / delete, Timestamp.fromDate / now.

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !v.__sentinel;
const clone = (v) => (v instanceof Date ? new Date(v) : isPlainObject(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : Array.isArray(v) ? v.map(clone) : v);

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  keys.slice(0, -1).forEach((k) => { if (!isPlainObject(cur[k])) cur[k] = {}; cur = cur[k]; });
  const last = keys[keys.length - 1];
  if (value && value.__sentinel === "delete") delete cur[last];
  else cur[last] = resolve(value, cur[last]);
}
function resolve(value, current) {
  if (value && value.__sentinel === "serverTimestamp") return new Date(FIXED_NOW);
  if (value && value.__sentinel === "increment") return (typeof current === "number" ? current : 0) + value.n;
  return clone(value);
}
function applyOps(op, a, b) {
  switch (op) {
    case "==": return JSON.stringify(a) === JSON.stringify(b) || a === b;
    case "!=": return b === null ? a !== undefined && a !== null : !(JSON.stringify(a) === JSON.stringify(b) || a === b);
    case "<": return a !== undefined && a < b;
    case "<=": return a !== undefined && a <= b;
    case ">": return a !== undefined && a > b;
    case ">=": return a !== undefined && a >= b;
    case "in": return Array.isArray(b) && b.some((x) => applyOps("==", a, x));
    case "not-in": return Array.isArray(b) && a !== undefined && !b.some((x) => applyOps("==", a, x));
    case "array-contains": return Array.isArray(a) && a.some((x) => applyOps("==", x, b));
    default: throw new Error(`fakeFirestore: unsupported operator ${op}`);
  }
}

function createFakeFirestore(seed = {}) {
  const state = { store: new Map(), log: { writes: [], reads: 0 }, autoId: 0 };

  const load = (data) => {
    state.store = new Map();
    Object.entries(data || {}).forEach(([col, docs]) => {
      state.store.set(col, new Map(Object.entries(docs).map(([id, d]) => [id, clone(d)])));
    });
    state.log = { writes: [], reads: 0 };
    state.autoId = 0;
  };
  const col = (name) => { if (!state.store.has(name)) state.store.set(name, new Map()); return state.store.get(name); };

  const snapDoc = (colName, id) => {
    const data = col(colName).get(id);
    const ref = docRef(colName, id);
    return { id, ref, exists: data !== undefined, data: () => (data === undefined ? undefined : clone(data)) };
  };
  const record = (type, colName, id, payload) => state.log.writes.push({ type, path: `${colName}/${id}`, payload: clone(payload) });

  const applyWrite = (type, colName, id, payload, options) => {
    const target = col(colName);
    if (type === "create") {
      if (target.has(id)) { const e = new Error("6 ALREADY_EXISTS: Document already exists"); e.code = 6; throw e; }
      target.set(id, resolve(payload));
    } else if (type === "set") {
      if (options && options.merge && target.has(id)) { const cur = target.get(id); Object.entries(payload).forEach(([k, v]) => setPath(cur, k, v)); }
      else { const fresh = {}; Object.entries(payload).forEach(([k, v]) => setPath(fresh, k, v)); target.set(id, fresh); }
    } else if (type === "update") {
      if (!target.has(id)) { const e = new Error(`5 NOT_FOUND: No document to update: ${colName}/${id}`); e.code = 5; throw e; }
      const cur = target.get(id);
      Object.entries(payload).forEach(([k, v]) => setPath(cur, k, v));
    } else if (type === "delete") {
      target.delete(id);
    }
    record(type, colName, id, payload || {});
  };

  function docRef(colName, id) {
    return {
      id, path: `${colName}/${id}`, parent: { id: colName },
      get: async () => { state.log.reads += 1; return snapDoc(colName, id); },
      set: async (data, options) => applyWrite("set", colName, id, data, options),
      update: async (data) => applyWrite("update", colName, id, data),
      create: async (data) => applyWrite("create", colName, id, data),
      delete: async () => applyWrite("delete", colName, id),
    };
  }

  function query(colName, filters = [], order = null, max = Infinity) {
    const q = {
      where: (field, op, value) => query(colName, [...filters, { field, op, value }], order, max),
      orderBy: (field, dir = "asc") => query(colName, filters, { field, dir }, max),
      limit: (n) => query(colName, filters, order, n),
      get: async () => {
        state.log.reads += 1;
        let docs = [...col(colName).entries()].filter(([, d]) => filters.every((f) => applyOps(f.op, getPath(d, f.field), f.value)));
        if (order) docs.sort(([, a], [, b]) => (getPath(a, order.field) > getPath(b, order.field) ? 1 : -1) * (order.dir === "desc" ? -1 : 1));
        docs = docs.slice(0, max).map(([id]) => snapDoc(colName, id));
        return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
      },
    };
    return q;
  }

  const db = {
    collection: (name) => ({
      ...query(name),
      doc: (id) => docRef(name, id || `auto_${++state.autoId}`),
      add: async (data) => { const id = `auto_${++state.autoId}`; applyWrite("create", name, id, data); return docRef(name, id); },
    }),
    batch: () => {
      const ops = [];
      const api = {
        set: (ref, data, options) => { ops.push(["set", ref, data, options]); return api; },
        update: (ref, data) => { ops.push(["update", ref, data]); return api; },
        delete: (ref) => { ops.push(["delete", ref]); return api; },
        create: (ref, data) => { ops.push(["create", ref, data]); return api; },
        commit: async () => ops.forEach(([type, ref, data, options]) => applyWrite(type, ref.path.split("/")[0], ref.id, data, options)),
      };
      return api;
    },
    runTransaction: async (fn) => {
      const tx = {
        get: async (target) => target.get(),
        set: (ref, data, options) => applyWrite("set", ref.path.split("/")[0], ref.id, data, options),
        update: (ref, data) => applyWrite("update", ref.path.split("/")[0], ref.id, data),
        create: (ref, data) => applyWrite("create", ref.path.split("/")[0], ref.id, data),
        delete: (ref) => applyWrite("delete", ref.path.split("/")[0], ref.id),
      };
      return fn(tx);
    },
    settings: () => {},
  };

  const admin = {
    firestore: Object.assign(() => db, {
      FieldValue: {
        serverTimestamp: () => ({ __sentinel: "serverTimestamp" }),
        increment: (n) => ({ __sentinel: "increment", n }),
        delete: () => ({ __sentinel: "delete" }),
      },
      Timestamp: { fromDate: (d) => d, now: () => new Date(FIXED_NOW) },
    }),
    // Tests that do not care about Firebase Auth get a predictable failure, like a user that does not exist.
    auth: () => ({ getUser: async () => { const e = new Error("fake: user not found in Firebase Auth"); e.code = "auth/user-not-found"; throw e; } }),
  };

  load(seed);
  return {
    db, admin, FIXED_NOW,
    reset: load,
    get log() { return state.log; },
    data: (name) => Object.fromEntries([...col(name).entries()].map(([id, d]) => [id, clone(d)])),
    /** Install as the module config/firebase for a test file (call BEFORE requiring code under test). */
    install() {
      const p = require.resolve("../../src/config/firebase");
      require.cache[p] = { id: p, filename: p, loaded: true, exports: { admin, db } };
    },
  };
}

module.exports = { createFakeFirestore, FIXED_NOW };
