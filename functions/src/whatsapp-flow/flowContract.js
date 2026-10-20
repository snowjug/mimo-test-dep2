"use strict";
// Single source of truth shared by the handler, the Flow JSON tests and the docs.
// TEST WORKFLOW ONLY: nothing here creates orders, collects payment or dispatches print jobs.

const COLOR_NOTICE = "🎨 Color printing is available only at MIMO 2.0. Your job will be routed automatically to MIMO 2.0.";

const SCREENS = Object.freeze({
  UPLOAD: "UPLOAD",
  CONFIGURE: "CONFIGURE",
  PROCESSING: "PROCESSING",
  REVIEW: "REVIEW",
  SUCCESS: "SUCCESS",
});

const COLOR_MODES = Object.freeze(["bw", "color"]);
const MAX_COPIES = 10; // matches the CONFIGURE dropdown in flow/mimo-print.flow.json (checked by a test)

module.exports = { COLOR_NOTICE, SCREENS, COLOR_MODES, MAX_COPIES };
