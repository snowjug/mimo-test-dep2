"use strict";
// One fresh Node process: measures module load and the FIRST ping/upload requests. Local only, NOT a Cloud Run cold start.
const t0 = process.hrtime.bigint();
const ms = (a, b = process.hrtime.bigint()) => Number(b - a) / 1e6;
const { createFlowHandler } = require("../src/flowHandler");
const { createCdnFetcher } = require("../src/cdn");
const requireMs = ms(t0);
const f = require("../test/fixtures");

(async () => {
  const keys = f.generateKeys();
  const cdn = await f.startFixtureCdn();
  const handle = createFlowHandler({ privateKeyPem: keys.privateKey, appSecrets: [f.TEST_APP_SECRET], deps: { fetchCdn: createCdnFetcher({ allowLoopbackHttp: true, maxBytes: 3e7 }) }, db: f.stubDb() });
  const docs = [f.addDocument(cdn, "a.pdf", await f.makePdf(10))];
  const send = async (payload) => {
    const req = f.buildEncryptedRequest(payload, keys.publicKey);
    const raw = Buffer.from(JSON.stringify(req.body));
    const t = process.hrtime.bigint();
    const res = await handle(raw, { "x-hub-signature-256": f.sign(raw) });
    return { ms: ms(t), status: res.status };
  };
  const ping = await send({ action: "ping" });
  const upload = await send({ action: "data_exchange", screen: "UPLOAD", flow_token: "c", data: { documents: docs } });
  console.log(JSON.stringify({ requireMs, firstPingMs: ping.ms, firstUploadMs: upload.ms, ok: ping.status === 200 && upload.status === 200 }));
  await cdn.close();
})();
