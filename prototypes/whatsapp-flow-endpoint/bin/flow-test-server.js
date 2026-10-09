#!/usr/bin/env node
"use strict";
// Starts the TEST-ONLY local Flow adapter on a loopback address. See README "Local HTTP adapter".
// Prints only host, port and routes. Never prints configuration values.
const { loadConfig, createHttpAdapter, ConfigError } = require("../src/httpAdapter");

let config;
try { config = loadConfig(process.env); } catch (e) {
  console.error(`flow-test-server: ${e instanceof ConfigError ? e.message : "invalid configuration"}`);
  process.exit(2);
}
const adapter = createHttpAdapter(config);
adapter.listen().then((addr) => {
  console.log(`flow-test-server (TEST ONLY) listening on http://${addr.address}:${addr.port}  routes: POST /flow, GET /healthz, GET /readyz`);
  console.log("Loopback only. Not reachable from other machines. Press Ctrl+C to stop.");
}, (e) => { console.error(`flow-test-server: cannot listen (${e.code || "error"})`); process.exit(1); });

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => adapter.close().then(() => process.exit(0)));
