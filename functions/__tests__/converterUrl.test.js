"use strict";
// Regression guard for the Office-upload outage: a local-development CONVERTER_SERVICE_URL (http://localhost:8082)
// was deployed to production, so the deployed function called a converter that does not exist on its own machine
// and every Word / PowerPoint / Excel upload failed. On a deployed runtime a localhost URL must be ignored.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");

const { resolveConverterUrl } = require("../src/services/converter.service");
const { DEFAULT_CONVERTER_SERVICE_URL } = require("../src/config/env");

const CLOUD = { K_SERVICE: "api" };

test("a deployed function ignores a localhost converter URL and uses the Cloud Run converter", () => {
  for (const bad of ["http://localhost:8082", "http://127.0.0.1:8082/", "http://0.0.0.0:8082", "http://[::1]:8082", "HTTP://LOCALHOST:8082"]) {
    assert.strictEqual(resolveConverterUrl({ ...CLOUD, CONVERTER_SERVICE_URL: bad }), DEFAULT_CONVERTER_SERVICE_URL, bad);
  }
});

test("a deployed function keeps a real converter URL, without a trailing slash", () => {
  assert.strictEqual(
    resolveConverterUrl({ ...CLOUD, CONVERTER_SERVICE_URL: "https://my-converter.example.run.app/" }),
    "https://my-converter.example.run.app"
  );
});

test("a URL that merely contains the word localhost in its host is not treated as local", () => {
  const url = "https://localhost-converter.example.run.app";
  assert.strictEqual(resolveConverterUrl({ ...CLOUD, CONVERTER_SERVICE_URL: url }), url);
});

test("local development keeps a localhost converter URL", () => {
  assert.strictEqual(resolveConverterUrl({ CONVERTER_SERVICE_URL: "http://localhost:8082" }), "http://localhost:8082");
});

test("the Functions emulator counts as local development", () => {
  const env = { FUNCTIONS_EMULATOR: "true", FUNCTION_TARGET: "api", CONVERTER_SERVICE_URL: "http://localhost:8082" };
  assert.strictEqual(resolveConverterUrl(env), "http://localhost:8082");
});

test("with nothing configured the Cloud Run converter is used", () => {
  assert.strictEqual(resolveConverterUrl({ ...CLOUD }, ""), DEFAULT_CONVERTER_SERVICE_URL);
});
