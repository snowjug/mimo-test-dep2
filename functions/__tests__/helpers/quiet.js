// The controllers log a lot (console.log/warn/error). Under `node --test` that output travels over the same pipe as the
// runner's own result messages; with many test files it occasionally corrupts them ("Unable to deserialize cloned data").
// Tests are silent unless TEST_VERBOSE=1. Tests that assert on logging replace console.error themselves.
if (!process.env.TEST_VERBOSE) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
}
