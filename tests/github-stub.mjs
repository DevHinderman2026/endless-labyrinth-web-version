// For running tests/smoke.mjs where GitHub cannot be reached from the browser (a
// sandbox whose proxy answers without CORS headers, which the browser reports as a
// page error): every page is answered an empty events folder.
//   node --import ./tests/github-stub.mjs tests/smoke.mjs http://localhost:8774
import { chromium } from 'playwright';

const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  // (7.2.0) A test that makes its own context gets the leaderboard's files answered too.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...c) => {
    const ctx = await newContext(...c);
    await ctx.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{}' }));
    return ctx;
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await newPage(...a);
    await page.route('https://api.github.com/**', (route) => route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '[]' }));
    // (7.2.0) The weekly leaderboard's board and results: empty (a 404 would be a page error). A test that
    // needs them routes them itself first (Playwright tries the newest route first).
    await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{}' }));
    return page;
  };
  return browser;
};
