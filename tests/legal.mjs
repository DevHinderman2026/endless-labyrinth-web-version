// The Terms of Use, Privacy Policy and Accessibility Statement (web 1.1.0), in a
// real browser engine: 22 numbered sections as real headings, numbered
// subsections, lettered lists, the common questions with YouTube's links, a last
// updated date on each page, and the three in every page's footer. Run with the
// site served:
//   node --import ./tests/github-stub.mjs tests/legal.mjs http://localhost:8765
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8765';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// ------------------------------------------------------------ Terms of Use
await page.goto(base + '/terms.html');
{
  const h2s = await page.locator('main h2').allTextContents();
  const numbered = h2s.filter((t) => /^\d+\. /.test(t));
  check(numbered.length === 23, `23 numbered sections, each a real heading: ${numbered.length}`);
  check(numbered.every((t, i) => t.startsWith(`${i + 1}. `)), 'numbered 1 to 23 in order');
  const titles = numbered.map((t) => t.replace(/^\d+\. /, ''));
  for (const want of ['Acceptance of these Terms', 'All ages', 'Hacking and security', 'Cheating and tampering', 'Bots and automated access', 'Attacks and overload',
    'Malware, phishing and impersonation', 'Copying and redistribution', 'No selling', 'The sounds', 'Names and identity', 'Share buttons and outside services',
    'AI assistance and copyright', 'Enforcement', 'No warranty', 'Limitation of liability', 'Changes to these Terms', 'Severability and entire agreement', 'Contact',
    'Assistive technology is always allowed', 'Recording, streaming and responsible reporting', 'The Windows version']) {
    check(titles.includes(want), `section: ${want}`);
  }
  const h3s = await page.locator('main h3').allTextContents();
  check(h3s.some((t) => t.startsWith('5.1 ')) && h3s.some((t) => t.startsWith('5.2 ')) && h3s.some((t) => t.startsWith('5.3 ')) && h3s.some((t) => t.startsWith('22.2 ')), `numbered subsections as headings, such as 5.1 to 5.3 and 22.2: ${h3s.filter((t) => /^5\./.test(t)).join(', ')}`);
  const lettered = await page.locator('main ol[type="a"]').count();
  check(lettered >= 6, `lettered lists for things to do and not to do: ${lettered}`);
  const contents = await page.locator('nav.contents a').evaluateAll((as) => as.map((a) => a.getAttribute('href').slice(1)));
  const missing = [];
  for (const id of contents) if (!(await page.locator('#' + id).count())) missing.push(id);
  check(contents.length === 24 && missing.length === 0, `every contents link has its section ${missing}`);
  check(/Last updated: \d+ \w+ 2026\./.test(await page.locator('header.site p').textContent()), 'the date last updated is at the top');
  const text = await page.locator('main').textContent();
  check(/The game is free, and it stays free/.test(text) && /No one may sell, rent, license or charge money/.test(text), 'no selling is stated plainly in its own section');
  check(/Ordinary search engines may index/.test(text), 'search engines are allowed');
  check(/never treated as bots/.test(text), 'assistive technology is never a bot');
  check(/end your permission to use the site/.test(text) && !/access may be blocked/.test(text), 'enforcement promises only what can be done');
  check(/laws of the State of Ohio/.test(text), 'governing law: Ohio');
  check(/Anyone of any age may play/.test(text), 'all ages');
  check(/report it to the maker privately/.test(text), 'responsible security reporting');
  check(/You may earn money from your own gameplay videos/.test(text) && /exception to section 10/.test(text), 'monetized videos are allowed as an exception to no selling');
  // The common questions.
  const q = await page.locator('#questions ~ h3').allTextContents();
  check(q.length >= 6 && /record or stream/.test(q[0]), `common questions at the end: ${q.length}`);
  const recordAnswer = await page.locator('#q-record ~ p').first().textContent();
  check(/^Absolutely!/.test(recordAnswer) && /encouraged/.test(recordAnswer) && /niche/.test(recordAnswer), `the recording answer starts with Absolutely and encourages it: ${recordAnswer.slice(0, 60)}`);
  const links = await page.locator('main a[href^="https://"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(links.includes('https://support.google.com/youtube/answer/2797454') && links.includes('https://support.google.com/youtube/answer/12104471') && links.includes('https://www.youtube.com/howyoutubeworks/policies/community-guidelines/'), 'links to disputing, appealing and the Community Guidelines');
  check(/Escalate to Appeal/.test(text) && /seven days/.test(text) && /copyright strike/.test(text), 'Escalate to Appeal, its seven days and the strike warning are explained');
  check(/paid promotion of the game without permission/.test(text), 'paid promotion without permission is listed among the things not to do');
  // Web 1.1.2: one set of Terms for both versions.
  check(/They also cover the Windows version of Endless Labyrinth/.test(text) && !/do not cover the Windows version/.test(text), 'the Terms cover the Windows version');
  check(/downloading or playing the Windows version, you accept these Terms/.test(text), 'downloading or playing on Windows is acceptance');
  check(h3s.some((t) => t === '9.4 Improvements and fan versions') && /only with the maker's written permission/.test(text), 'changing the game or sharing a version built from it needs written permission');
  check(h3s.some((t) => t === '9.5 Your own game') && /making your own game from scratch, with your own code and your own sounds/.test(text), 'making your own game from scratch is free');
  for (const sub of ['23.1 Official download only', '23.2 No changing the program', '23.3 Save files are sealed', '23.4 Windows security warnings']) check(h3s.includes(sub), `Windows subsection: ${sub}`);
  check(/SmartScreen/.test(text) && /do not run it/.test(text), 'the Windows security warning is explained honestly');
  check(q.some((t) => /cover the Windows version/.test(t)) && q.some((t) => /change the game, or make my own version/.test(t)), 'common questions about Windows and about changing the game');
}

// ------------------------------------------------------------ the other two
for (const [pg, title, must] of [
  ['privacy.html', 'Privacy Policy', [/collects no personal data/, /only when you tap one of their buttons/, /GitHub Pages/, /IP address/, /sends nothing about you during play/,
    /covers the website, the game it plays, and the Windows version/, /players folder, on your own computer/, /newer version of the game has been released/, /only if a sound in its sounds folder is missing or damaged/, /NV Access/]],
  ['accessibility-statement.html', 'Accessibility Statement', [/VoiceOver on an iPhone, iPad or Mac, TalkBack on Android, ChromeVox on a Chromebook, and Orca on Linux/, /turn your screen reader off while you play/, /Windows computers are pointed/, /Chrome, Edge and Safari/, /high contrast and bigger text/]],
]) {
  await page.goto(base + '/' + pg);
  check((await page.locator('header.site h1').textContent()) === title, `${pg}: ${title}`);
  check(/Last updated: \d+ \w+ 2026\./.test(await page.locator('header.site p').textContent()), `${pg}: the date last updated is at the top`);
  const text = await page.locator('main').textContent();
  for (const re of must) check(re.test(text), `${pg} says: ${re}`);
  check((await page.locator('main h2').count()) >= 5, `${pg}: real headings`);
}

// ------------------------------------------------------------ in every footer
for (const pg of ['index.html', 'about.html', 'events.html', 'terms.html', 'play.html']) {
  await page.goto(base + '/' + pg);
  if (pg === 'play.html') {
    check((await page.locator('footer.site').count()) === 0, 'the play page has no footer: the whole screen is the game');
    continue;
  }
  const hrefs = await page.locator('footer.site nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(hrefs.includes('terms.html') && hrefs.includes('privacy.html') && hrefs.includes('accessibility-statement.html'), `${pg}: the footer links to the three legal pages`);
  const navHrefs = await page.locator('nav.site a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(!navHrefs.includes('terms.html'), `${pg}: the legal pages are not in the site links`);
}
check(errors.length === 0, `no page errors ${errors}`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
