// Which devices may play: phones, tablets, Chromebooks, Macs and Linux computers;
// Windows computers are refused. Run: serve the site folder, then
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
  if (opts.touchPoints) await page.addInitScript((n) => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n }), opts.touchPoints);
  await page.goto(base + '/play.html');
  const r = await page.evaluate(async () => (await import('./js/device.js')).deviceKind());
  const startHidden = await page.evaluate(() => document.getElementById('start').hidden);
  await ctx.close();
  return [r, startHidden];
}
const tablet = await kind({ userAgent: LINUX, hasTouch: true, isMobile: true, viewport: { width: 1280, height: 800 } });
check(tablet[0] === 'android-tablet' && !tablet[1], `a big Android tablet in Chrome's desktop mode (Linux, touch only) may play: ${tablet}`);
const laptop = await kind({ userAgent: LINUX, viewport: { width: 1280, height: 800 } });
check(laptop[0] === 'linux' && !laptop[1], `a Linux computer may play: ${laptop}`);
const cros = await kind({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', hasTouch: true, isMobile: true });
check(cros[0] === 'chromebook' && !cros[1], `a Chromebook may play, touch screen or not: ${cros}`);
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';
const mac = await kind({ userAgent: MAC, viewport: { width: 1440, height: 900 } });
check(mac[0] === 'mac' && !mac[1], `a Mac may play: ${mac}`);
const ipad = await kind({ userAgent: MAC, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 1024, height: 1366 } });
check(ipad[0] === 'ipad' && !ipad[1], `an iPad (which says it is a Mac) is still an iPad: ${ipad}`);
// Web 1.1.0: the iPhone and iPad mix-up. The screen decides, not the words.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const IPAD_MOBILE = 'Mozilla/5.0 (iPad; CPU OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const iphone = await kind({ userAgent: IPHONE, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 390, height: 844 } });
check(iphone[0] === 'iphone' && !iphone[1], `an iPhone in Safari: ${iphone}`);
const iphoneWide = await kind({ userAgent: IPHONE, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 956, height: 440 } });
check(iphoneWide[0] === 'iphone', `the largest iPhone, held sideways, is still an iPhone: ${iphoneWide}`);
const iphoneDesktop = await kind({ userAgent: MAC, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 390, height: 844 } });
check(iphoneDesktop[0] === 'iphone', `an iPhone that says it is a Mac (Request Desktop Website) is an iPhone, not an iPad: ${iphoneDesktop}`);
const ipadMobile = await kind({ userAgent: IPAD_MOBILE, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 820, height: 1180 } });
check(ipadMobile[0] === 'ipad', `an iPad that says iPad (Request Mobile Website) is an iPad: ${ipadMobile}`);
const ipadSaysPhone = await kind({ userAgent: IPHONE, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 744, height: 1133 } });
check(ipadSaysPhone[0] === 'ipad', `an iPad whose browser says iPhone is an iPad, not a phone (the smallest iPad mini): ${ipadSaysPhone}`);
const ipadSideways = await kind({ userAgent: MAC, hasTouch: true, isMobile: true, touchPoints: 5, viewport: { width: 1366, height: 1024 } });
check(ipadSideways[0] === 'ipad', `an iPad held sideways is an iPad: ${ipadSideways}`);
const macTouch = await kind({ userAgent: MAC, viewport: { width: 1440, height: 900 }, touchPoints: 0 });
check(macTouch[0] === 'mac', `a Mac with no touch screen is a Mac, whatever its screen size: ${macTouch}`);
const win = await kind({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
check(win[0] === 'windows' && win[1], `a Windows computer is refused: ${win}`);
const phone = await kind({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });
check(phone[0] === 'android-phone' && !phone[1], `an Android phone may play: ${phone}`);
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
