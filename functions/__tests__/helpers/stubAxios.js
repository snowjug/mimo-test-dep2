// Replaces the `axios` module with a programmable stub so payment code never reaches Cashfree or the network.
// Install BEFORE requiring the code under test:  const http = installAxiosStub();
//   http.on("get", /orders\/order_1$/, () => ({ data: { order_status: "PAID" } }));
//   http.on("post", /refunds$/, async (url, body) => { throw Object.assign(new Error("boom"), { response: { data: { message: "nope" } } }); });
//   http.calls   // [{ method, url, body, config }]   http.reset()
function installAxiosStub() {
  const calls = [];
  let handlers = [];
  const dispatch = async (method, url, body, config) => {
    calls.push({ method, url, body, config });
    const h = handlers.find((x) => x.method === method && x.match.test(url));
    if (!h) throw new Error(`stubAxios: no handler for ${method.toUpperCase()} ${url}`);
    return h.fn(url, body, config);
  };
  const stub = {
    calls,
    on: (method, match, fn) => { handlers.push({ method, match, fn }); return stub; },
    reset: () => { handlers = []; calls.length = 0; },
    get: (url, config) => dispatch("get", url, undefined, config),
    post: (url, body, config) => dispatch("post", url, body, config),
    create: () => stub,
    isAxiosError: () => false,
  };
  const p = require.resolve("axios");
  require.cache[p] = { id: p, filename: p, loaded: true, exports: stub };
  return stub;
}
module.exports = { installAxiosStub };
