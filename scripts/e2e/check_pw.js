const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  console.log("Navigating to localhost...");
  await page.goto('http://localhost:5173/landing', { waitUntil: 'networkidle' });

  console.log("Page title:", await page.title());
  console.log("Body innerHTML length:", (await page.innerHTML('body')).length);
  
  await browser.close();
})();
