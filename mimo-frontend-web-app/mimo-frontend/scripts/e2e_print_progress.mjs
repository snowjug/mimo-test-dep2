// End-to-end check of the kiosk printing screen against a mocked production API.
// Usage: node run.mjs <distDir> <label> [scenarioName...]
// Serves the built kiosk, drives it like a customer (swipe, keypad, submit) in local headless Chrome, and answers
// the API calls the way the Pi/Firestore would during a real print. Every rendered progress value is sampled and
// checked against what had actually been verified (served) at that moment.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [, , DIST, LABEL = 'build', ...ONLY] = process.argv;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = 'api-upqxuj7evq-uc.a.run.app';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(DIST, p);
  if (!f.startsWith(path.resolve(DIST)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const json = (body, status = 200, headers = {}) => ({ status, body, headers });
const printing = (k, total) => json({ status: 'printing', isPrinted: false, sheetsCompleted: k, totalSheets: total });
const done = (total) => json({ status: 'completed', isPrinted: true, sheetsCompleted: total, totalSheets: total });

// A Pi timeline: sheet k verified at times[k-1] ms after /kiosk/print, completed at `completedAt`.
const timeline = (total, times, completedAt) => (t) => {
  if (t >= completedAt) return done(total);
  const k = times.filter((x) => t >= x).length;
  return printing(Math.min(k, total - 1), total);
};

const SCENARIOS = [
  { name: 'single sheet', pages: 1, expect: 'summary', jobStatus: timeline(1, [], 3500) },
  { name: 'multi sheet (5)', pages: 5, expect: 'summary', jobStatus: timeline(5, [2000, 3500, 5000, 6500], 8500) },
  { name: 'multi sheet (21, like job JFtclhbE)', pages: 21, expect: 'summary',
    jobStatus: timeline(21, Array.from({ length: 20 }, (_, i) => 1500 + i * 450), 11000) },
  { name: 'delayed / out-of-order responses', pages: 5, expect: 'summary',
    jobStatus: (t, i) => (t >= 7000 ? done(5) : printing([0, 2, 1, 3, 1, 2, 4, 3][Math.min(7, Math.floor(i / 4))], 5)) },
  { name: 'completed with no sheet data (counter unreadable)', pages: 3, expect: 'summary',
    jobStatus: (t) => (t >= 4000 ? done(3) : json({ status: 'printing', isPrinted: false, sheetsCompleted: 0, totalSheets: 3 })) },
  { name: 'rate limited mid-job (429)', pages: 4, expect: 'summary',
    jobStatus: (t) => (t >= 2000 && t < 3500 ? json({ error: 'Too many attempts.' }, 429, { 'Retry-After': '1' })
      : timeline(4, [1000, 4000, 4500], 6000)(t)) },
  { name: 'printer fails after 2 of 5', pages: 5, expect: 'error', expectText: 'Paper Jam',
    jobStatus: (t) => (t >= 4000 ? json({ status: 'failed', isPrinted: false, sheetsCompleted: 2, totalSheets: 5,
      printerStatus: 'The printer stopped after 2 of 5 sheets (printer shows: Paper Jam). You will be refunded.' })
      : timeline(5, [1500, 3000], 99999)(t)) },
  { name: 'refused 400 (already redeemed)', pages: 2, expect: 'error', expectText: 'already redeemed', retry: 'code-entry',
    print: json({ error: 'Print code already redeemed or job not paid' }, 400), jobStatus: () => done(2) },
  { name: 'refused 403 (restricted machine)', pages: 2, expect: 'error', expectText: 'restricted', retry: 'code-entry',
    print: json({ error: 'This print job is restricted to machine SV-002.' }, 403), jobStatus: () => done(2) },
  { name: 'refused 409 (code collision)', pages: 2, expect: 'error', expectText: 'more than one order', retry: 'code-entry',
    print: json({ error: 'This code matched more than one order. Please contact support — do not retry.' }, 409),
    jobStatus: () => done(2) },
  { name: 'print request lost, job never started (stalled at paid)', pages: 2, expect: 'error',
    expectText: 'could not be started', print: 'abort', timeoutMs: 40000,
    jobStatus: () => json({ status: 'paid', isPrinted: false, sheetsCompleted: 0, totalSheets: 2 }) },
  { name: 'page reload mid-print, single sheet', pages: 1, expect: 'summary', reloadAt: 3000, timeoutMs: 30000,
    jobStatus: timeline(1, [], 9000) },
  { name: 'page reload mid-print, multi sheet (5)', pages: 5, expect: 'summary', reloadAt: 4500, timeoutMs: 30000,
    jobStatus: timeline(5, [2000, 3500, 6000, 8000], 10000) },
  { name: 'page reload after the printer failed shows no stale print', pages: 3, expect: 'home', reloadAt: 7000,
    timeoutMs: 20000,
    jobStatus: (t) => (t >= 3000 ? json({ status: 'failed', isPrinted: false, sheetsCompleted: 1, totalSheets: 3,
      printerStatus: 'Paper Jam' }) : printing(t >= 1500 ? 1 : 0, 3)) },
  { name: 'retry after failure must not fake success', pages: 3, expect: 'error', retry: 'code-entry',
    jobStatus: (t) => (t >= 2500 ? json({ status: 'failed', isPrinted: false, sheetsCompleted: 0, totalSheets: 3,
      printerStatus: 'Printer offline' }) : printing(0, 3)) },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=1340,800'] });

async function visibleScreen(page) {
  return page.evaluate(() => {
    const s = [...document.querySelectorAll('.screen.visible')].find((el) => el.offsetParent !== null || getComputedStyle(el).display !== 'none');
    if (!s) return 'none';
    if (s.querySelector('.cursor-grab')) return 'home';
    if (s.querySelector('[aria-label="Submit code"]')) return 'code-entry';
    if ([...s.querySelectorAll('tspan')].some((t) => t.getAttribute('font-size') === '92px')) return 'printing';
    if (/Try Again|Returning home|refund/i.test(s.innerText) && !/Print Completed/i.test(s.innerText) && s.querySelector('button')) {
      if (/Hello|printed successfully|Collect/i.test(s.innerText) && !/Try Again/.test(s.innerText)) return 'summary';
      return /Try Again|went wrong|could not|refused|error|stopped|offline|redeemed|restricted|order/i.test(s.innerText) ? 'error' : 'summary';
    }
    return 'summary-or-other';
  });
}

async function runScenario(sc) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1340, height: 800 });
  const served = [];           // job-status responses: {t, status, k, total}
  let printAt = null, printCalls = 0, jobCalls = 0;
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return req.abort();
    if (u.hostname !== API) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors() });
    if (u.pathname === '/get-documents-by-code') {
      return reply(req, json({ userName: 'Test User', documents: [{ file: 'doc.pdf', pages: sc.pages, copies: 1 }] }));
    }
    if (u.pathname === '/kiosk/print') {
      printAt = Date.now(); printCalls++;
      if (sc.print === 'abort') return req.abort('failed');
      return reply(req, sc.print || json({ success: true, message: 'Print job enqueued successfully' }));
    }
    if (u.pathname === '/kiosk/job-status') {
      const t = Date.now() - (printAt ?? Date.now());
      const r = sc.jobStatus(t, jobCalls++);
      served.push({ t: Date.now(), status: r.body.status ?? `HTTP ${r.status}`, k: r.body.sheetsCompleted, total: r.body.totalSheets });
      return reply(req, r);
    }
    return req.continue();
  });

  // Sampler runs in every document, so it keeps recording across a page reload (what the tablet's WebView does
  // when the Activity is recreated or the renderer restarts).
  const samples = [];
  await page.exposeFunction('__push', (s) => samples.push(s));
  await page.evaluateOnNewDocument(() => {
    setInterval(() => {
      const vis = [...document.querySelectorAll('.screen')].filter((s) => getComputedStyle(s).display !== 'none');
      const tsp = [...document.querySelectorAll('tspan')].find((t) => t.getAttribute('font-size') === '92px' && t.closest('.screen.visible'));
      const home = vis.some((s) => s.querySelector('.cursor-grab'));
      window.__push?.({ t: Date.now(), p: tsp ? Number(tsp.textContent) : null, home, screen: vis.map((s) => s.innerText.slice(0, 40)).join('|') });
    }, 25);
  });

  await page.goto(`http://localhost:${PORT}/?kioskId=CV-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cursor-grab', { visible: true, timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  // swipe to unlock
  const thumb = await page.$('.cursor-grab');
  const b = await thumb.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(b.x + b.width / 2 + i * 40, b.y + b.height / 2);
  await page.mouse.up();
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Submit code"]')].some((e) => e.offsetParent), { timeout: 10000 });

  for (const d of '4821') {
    await page.evaluate((d) => [...document.querySelectorAll(`#key-${d}`)].find((e) => e.offsetParent).click(), d);
  }
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Submit code"]')].find((e) => e.offsetParent).click());

  // wait for a terminal screen (optionally reloading the page part-way through the print, like the tablet does)
  const deadline = Date.now() + (sc.timeoutMs || 25000);
  let screen = 'none', reloadedAt = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (sc.reloadAt && !reloadedAt && printAt && Date.now() - printAt >= sc.reloadAt) {
      reloadedAt = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    screen = await visibleScreen(page);
    const reloadPending = sc.reloadAt && !reloadedAt;
    if (!reloadPending && screen !== 'printing' && screen !== 'code-entry' && screen !== 'none' && printCalls > 0) {
      if (screen === 'summary-or-other' || screen === 'summary' || screen === 'error') break;
    }
    if (reloadedAt && screen === 'home' && Date.now() - reloadedAt > 3000) break; // stayed on home after the reload
  }
  const finalText = await page.evaluate(() => [...document.querySelectorAll('.screen.visible')].map((s) => s.innerText).join(' '));
  let retryScreen = null;
  if (sc.retry) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((e) => e.offsetParent && /Try Again/.test(e.innerText))?.click());
    await new Promise((r) => setTimeout(r, 2500));
    retryScreen = await visibleScreen(page);
  }
  await page.close();
  return judge(sc, { screen, finalText, samples, served, retryScreen, printCalls, reloadedAt });
}

function judge(sc, { screen, finalText, samples, served, retryScreen, reloadedAt }) {
  const problems = [];
  if (sc.reloadAt) {
    if (!reloadedAt) problems.push('harness never reloaded the page');
    const firstDone = served.find((s) => s.status === 'completed' || s.status === 'failed');
    const homeMidPrint = samples.find((s) => s.home && s.t > reloadedAt + 1200 && (!firstDone || s.t < firstDone.t));
    if (homeMidPrint) problems.push('after the reload the kiosk showed the HOME screen while the job was still printing');
    samples = samples.filter((s) => s.t < reloadedAt || s.t > reloadedAt + 1200); // the reload itself blanks the page
  }
  const isSummary = /printed successfully|Print Completed|Collect|Thank/i.test(finalText) && !/Try Again/.test(finalText);
  const isError = /Try Again|Returning home/.test(finalText) && !isSummary;
  const landed = isSummary ? 'summary' : isError ? 'error' : screen;
  if (landed !== sc.expect) problems.push(`ended on "${landed}", expected "${sc.expect}"`);
  if (sc.expectText && !finalText.includes(sc.expectText)) problems.push(`final screen lacks "${sc.expectText}"`);

  const prog = samples.filter((s) => s.p !== null && !Number.isNaN(s.p));
  // verified ceiling at each instant = best sheet count served so far (100 only once "completed" was served)
  const firstCompleted = served.find((s) => s.status === 'completed');
  let maxOver = 0, regress = 0, last = -1;
  for (const s of prog) {
    const before = served.filter((r) => r.t <= s.t);
    const completedServed = before.some((r) => r.status === 'completed');
    const maxK = Math.max(0, ...before.filter((r) => r.status === 'printing').map((r) => Number(r.k) || 0));
    const total = Number(before.find((r) => r.total)?.total) || sc.pages;
    const allowed = completedServed ? 100 : Math.min(99, Math.floor((maxK / total) * 100));
    if (s.p > allowed) maxOver = Math.max(maxOver, s.p - allowed);
    if (s.p < last) regress++;
    last = s.p;
  }
  if (maxOver > 0) problems.push(`bar ran AHEAD of verified sheets by up to ${maxOver} points`);
  if (regress > 0) problems.push(`bar moved backwards ${regress} time(s)`);
  if (sc.expect !== 'summary' && prog.some((s) => s.p === 100)) problems.push('showed 100% for a job that did not complete');
  if (sc.retry && retryScreen !== sc.retry) problems.push(`"Try Again" went to "${retryScreen}", expected "${sc.retry}"`);

  const first100 = prog.find((s) => s.p === 100);
  const lag = firstCompleted && first100 ? first100.t - firstCompleted.t : null;
  if (sc.expect === 'summary' && lag !== null && lag > 800) problems.push(`100% shown ${lag} ms after completion was available`);
  const shown = [...new Set(prog.map((s) => s.p))].join(',');
  return { name: sc.name, ok: problems.length === 0, problems, lag, shown, retryScreen };
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Expose-Headers': 'Retry-After' };
}
function reply(req, r) {
  return req.respond({ status: r.status, contentType: 'application/json', headers: { ...cors(), ...r.headers }, body: JSON.stringify(r.body) });
}

let failed = 0;
console.log(`\n=== ${LABEL} (${DIST}) ===`);
for (const sc of SCENARIOS.filter((s) => !ONLY.length || ONLY.some((o) => s.name.includes(o)))) {
  let r;
  try { r = await runScenario(sc); } catch (e) { r = { name: sc.name, ok: false, problems: [`harness error: ${e.message}`] }; }
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.lag != null ? `  [100% lag ${r.lag} ms]` : ''}${r.shown ? `  shown: ${r.shown}` : ''}`);
  for (const p of r.problems || []) console.log(`        - ${p}`);
}
console.log(`${failed ? failed + ' FAILED' : 'ALL PASSED'}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
