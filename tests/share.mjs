// The share buttons (web 1.1.0), in a real browser engine: Facebook, X and the
// others open each service's own share page with this site's link, nothing of
// theirs loads with the page, and Copy the link copies it. Run with the site served:
//   node --import ./tests/github-stub.mjs tests/share.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const outside = [];
page.on('request', (r) => { if (!r.url().startsWith(base)) outside.push(r.url()); });

for (const pg of ['index.html', 'story.html']) {
  await page.goto(base + '/' + pg);
  const links = await page.locator('footer.site nav.share a').evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]));
  const names = links.map((l) => l[0]);
  check(names.join(' | ') === 'Share on Facebook | Share on X (Twitter) | Share on Reddit | Share on WhatsApp | Share on Email', `${pg}: the share buttons: ${names.join(', ')}`);
  const here = encodeURIComponent(base + '/' + pg);
  check(links[0][1] === `https://www.facebook.com/sharer/sharer.php?u=${here}` && links[0][2] === '_blank' && links[0][3] === 'noopener noreferrer', `${pg}: Facebook opens its own share page with this page's link, in a new tab`);
  check(links[1][1].startsWith('https://twitter.com/intent/post?url=' + here + '&text=') && /audio%20game/.test(links[1][1]), `${pg}: X opens its post page with the link and a line of text`);
  check(links[4][1].startsWith('mailto:?subject=Endless%20Labyrinth&body=') && links[4][2] === null, `${pg}: Email is a mailto link`);
  check(await page.locator('footer.site nav.share button', { hasText: 'Copy the link' }).count() === 1, `${pg}: a Copy the link button`);
}
// Web 1.1.1: from a link to a section, the page itself is shared, not the section.
await page.goto(base + '/terms.html#s22');
{
  const fb = await page.locator('footer.site nav.share a').first().getAttribute('href');
  check(fb === `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(base + '/terms.html')}`, `a section link shares the page itself: ${decodeURIComponent(fb.split('u=')[1])}`);
}
await page.goto(base + '/story.html');
check(outside.filter((u) => !/api\.github\.com/.test(u)).length === 0, `nothing outside this site is loaded with the page: ${outside.filter((u) => !/api\.github\.com/.test(u))}`);
check(await page.locator('script[src*="facebook"], script[src*="twitter"], script[src*="x.com"]').count() === 0, 'no Facebook or X script on the page');
await page.locator('footer.site nav.share button', { hasText: 'Copy the link' }).click();
await page.waitForFunction(() => /copied|could not be copied/.test(document.querySelector('footer.site .share-status').textContent));
const copied = await page.evaluate(() => navigator.clipboard.readText());
check(copied === base + '/story.html' && (await page.locator('footer.site .share-status').textContent()) === 'Link copied.', `Copy the link copies this page's link and says so: ${copied}`);
check(errors.length === 0, `no page errors ${errors}`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
