#!/usr/bin/env node
"use strict";
// Local STRUCTURAL validator for a WhatsApp Flow JSON file. Dependency-free (Node built-ins only).
//   node flow/validate-flow.js [path/to/flow.json]      (default: flow/mimo-print.flow.json)
// Exit 0 = no structural errors, 1 = errors found, 2 = unreadable/unparseable file.
//
// THIS DOES NOT PROVE META WILL ACCEPT THE FLOW. It checks the rules this project relies on (unique screen IDs,
// navigation and routing consistency, action shapes, ${data.*}/${form.*} references). Meta's own validation
// (Flow Builder / Flows API) is a separate external step; the rules marked [ASSUMED] below are from memory of
// Meta's docs and must be confirmed there.
const fs = require("fs");
const path = require("path");

const KNOWN_COMPONENTS = new Set([
  "TextHeading", "TextSubheading", "TextBody", "TextCaption", "RichText", "Form", "TextInput", "TextArea", "Dropdown",
  "RadioButtonsGroup", "CheckboxGroup", "DatePicker", "CalendarPicker", "Footer", "If", "Switch", "Image", "ImageCarousel",
  "EmbeddedLink", "OptIn", "PhotoPicker", "DocumentPicker", "NavigationList",
]);
const ACTIONS = new Set(["navigate", "data_exchange", "complete"]);
const SCREEN_ID = /^[A-Za-z_]+$/; // [ASSUMED] Meta: screen IDs are letters and underscores only

function* walk(nodes) {
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n || typeof n !== "object") continue;
    yield n;
    yield* walk(n.children);
    yield* walk(n.then);
    yield* walk(n.else);
    if (n.cases && typeof n.cases === "object") for (const v of Object.values(n.cases)) yield* walk(v);
  }
}

function refsIn(value, out = []) {
  if (typeof value === "string") for (const m of value.matchAll(/\$\{(data|form)\.([A-Za-z0-9_]+)/g)) out.push({ scope: m[1], name: m[2] });
  else if (Array.isArray(value)) value.forEach((v) => refsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => refsIn(v, out));
  return out;
}

function validateFlow(flow) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) return { errors: ["root must be a JSON object"], warnings };
  if (typeof flow.version !== "string" || !/^\d+\.\d+$/.test(flow.version)) err('"version" must be a string like "6.2"');
  if (!Array.isArray(flow.screens) || flow.screens.length === 0) { err('"screens" must be a non-empty array'); return { errors, warnings }; }

  const ids = new Set();
  const byId = new Map();
  for (const [i, s] of flow.screens.entries()) {
    if (!s || typeof s.id !== "string" || !s.id) { err(`screens[${i}] has no string "id"`); continue; }
    if (!SCREEN_ID.test(s.id)) err(`screen id "${s.id}" must contain only letters and underscores [ASSUMED Meta rule]`);
    if (ids.has(s.id)) err(`duplicate screen id "${s.id}"`);
    ids.add(s.id); byId.set(s.id, s);
  }

  const routing = flow.routing_model;
  let usesDataExchange = false;
  const terminals = [];

  for (const s of byId.values()) {
    const where = `screen ${s.id}`;
    if (!s.layout || s.layout.type !== "SingleColumnLayout" || !Array.isArray(s.layout.children)) { err(`${where}: layout must be SingleColumnLayout with a children array`); continue; }
    if (typeof s.title !== "string" || !s.title) warnings.push(`${where}: no title`);
    const dataKeys = new Set(Object.keys(s.data || {}));
    for (const [k, def] of Object.entries(s.data || {})) {
      if (!def || typeof def.type !== "string") err(`${where}: data "${k}" needs a "type"`);
      else if (!("__example__" in def) && !def.__example__) warnings.push(`${where}: data "${k}" has no __example__`);
    }
    const comps = [...walk(s.layout.children)];
    const names = new Set();
    const formNames = new Set();
    let footers = 0;
    for (const c of comps) {
      if (typeof c.type !== "string") { err(`${where}: component without "type"`); continue; }
      if (!KNOWN_COMPONENTS.has(c.type)) warnings.push(`${where}: unrecognised component type "${c.type}" (may be newer than this validator)`);
      if (c.name !== undefined && c.type !== "Form") { // Form names are separate from field names
        if (names.has(c.name)) err(`${where}: duplicate component name "${c.name}"`);
        names.add(c.name); formNames.add(c.name);
      }
      if (c.type === "Footer") footers++;
      const a = c["on-click-action"];
      if (a === undefined) { if (c.type === "Footer") err(`${where}: Footer has no on-click-action`); continue; }
      if (!a || !ACTIONS.has(a.name)) { err(`${where}: unknown action "${a && a.name}"`); continue; }
      if (a.name === "navigate") {
        const t = a.next;
        if (!t || t.type !== "screen" || typeof t.name !== "string") err(`${where}: navigate needs next:{type:"screen",name}`);
        else if (!ids.has(t.name)) err(`${where}: navigate targets unknown screen "${t.name}"`);
        else if (routing && !(routing[s.id] || []).includes(t.name)) err(`${where}: navigate to "${t.name}" is missing from routing_model.${s.id}`);
      } else if (a.name === "data_exchange") {
        usesDataExchange = true;
        if (a.payload !== undefined && (typeof a.payload !== "object" || Array.isArray(a.payload))) err(`${where}: data_exchange payload must be an object`);
      } else if (a.name === "complete") {
        if (!s.terminal) err(`${where}: "complete" is only valid on a terminal screen`);
      }
    }
    if (footers > 1) err(`${where}: more than one Footer`);
    if (s.terminal) {
      terminals.push(s.id);
      if (!comps.some((c) => c["on-click-action"] && c["on-click-action"].name === "complete")) err(`${where}: terminal screen needs a Footer with a "complete" action`);
    }
    for (const r of refsIn(s.layout)) {
      if (r.scope === "data" && !dataKeys.has(r.name)) err(`${where}: references \${data.${r.name}} which the screen's "data" does not declare`);
      if (r.scope === "form" && !formNames.has(r.name)) err(`${where}: references \${form.${r.name}} but no such field exists on the screen`);
    }
  }

  if (terminals.length === 0) err("no terminal screen");
  if (usesDataExchange) {
    if (typeof flow.data_api_version !== "string") err('"data_api_version" is required when data_exchange is used');
    if (!routing || typeof routing !== "object") err('"routing_model" is required when data_exchange is used');
  }
  if (routing && typeof routing === "object") {
    for (const [from, tos] of Object.entries(routing)) {
      if (!ids.has(from)) err(`routing_model key "${from}" is not a screen`);
      if (!Array.isArray(tos)) { err(`routing_model.${from} must be an array`); continue; }
      for (const t of tos) if (!ids.has(t)) err(`routing_model.${from} targets unknown screen "${t}"`);
    }
    for (const id of ids) if (!(id in routing)) err(`routing_model has no entry for screen "${id}"`);
    // Reachability from the first screen through routing_model.
    const seen = new Set([flow.screens[0].id]);
    const queue = [flow.screens[0].id];
    while (queue.length) for (const t of routing[queue.shift()] || []) if (!seen.has(t)) { seen.add(t); queue.push(t); }
    for (const id of ids) if (!seen.has(id)) err(`screen "${id}" is unreachable from "${flow.screens[0].id}" via routing_model`);
  }
  return { errors, warnings };
}

module.exports = { validateFlow };

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, "mimo-print.flow.json");
  let flow;
  try { flow = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error(`validate-flow: cannot read/parse ${file}: ${e.message}`); process.exit(2); }
  const { errors, warnings } = validateFlow(flow);
  console.log(`Flow file: ${file}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const e of errors) console.log(`  ERROR:   ${e}`);
  console.log(errors.length ? `RESULT: INVALID (${errors.length} error(s))` : "RESULT: structurally valid (local check only; Meta validation is a separate external step)");
  process.exit(errors.length ? 1 : 0);
}
