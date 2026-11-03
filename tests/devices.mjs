// Which devices may play: phones and tablets only. Run: serve the site folder, then
//   node tests/devices.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch();
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
async function kind(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(base + '/play.html');
  const r = await page.evaluate(async () => (await import('./js/device.js')).deviceKind());
  const startHidden = await page.evaluate(() => document.getElementById('start').hidden);
  await ctx.close();
  return [r, startHidden];
}
const tablet = await kind({ userAgent: LINUX, hasTouch: true, isMobile: true, viewport: { width: 1280, height: 800 } });
check(tablet[0] === 'android-tablet' && !tablet[1], `a big Android tablet in Chrome's desktop mode (Linux, touch only) may play: ${tablet}`);
// (A browser here cannot be given a touch screen and a mouse at once; a real
// Linux computer with a touch screen also has a fine pointer, and is refused.)
const laptop = await kind({ userAgent: LINUX, viewport: { width: 1280, height: 800 } });
check(laptop[0] === 'computer' && laptop[1], `a Linux computer is refused: ${laptop}`);
const cros = await kind({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', hasTouch: true, isMobile: true });
check(cros[0] === 'computer', `a Chromebook is refused, touch screen or not: ${cros}`);
const phone = await kind({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });
check(phone[0] === 'android-phone' && !phone[1], `an Android phone may play: ${phone}`);
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
