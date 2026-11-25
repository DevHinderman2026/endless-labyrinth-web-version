// Ultimate Mode's safe zone characters (web 6.0.0), played by script in a real
// browser engine. Run: serve the site folder, then
//   node --import ./tests/github-stub.mjs tests/safezones.mjs http://localhost:8790
// A cast of the test's own is used (the real one is js/data's, checked by its own
// tool), and a stand-in for the voice packs' recordings (web 6.1.0: js/voice.js
// VoiceLibrary), so both ways a character is heard are tried: their own recorded voice
// placed in 3D, and the device's voice with a beacon where a recording is missing.
// Checked: where they stand, greetings in their zone, the story line within two
// steps, the gift after it (and waiting, with call-backs, when you walk away), one
// gift a world, the eight groups' gifts, the rare gifts (two minutes, a chest you
// walk to), the lines heard remembered between runs, the world's mercy after a
// hint, and the chaos world stage's two minutes. It cannot hear.

import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8790';
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/huggingface|jsdelivr|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto(base + '/play.html?desktop=1');
await page.click('#start');
await page.waitForFunction(() => /Sounds loaded/.test(document.getElementById('lead').textContent), null, { timeout: 90000 });
await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => window.__el.game && window.__el.game.state === 'menu');

// ------------------------------------------------------------------ the real cast (agent story's js/data), read by the game
const real = await page.evaluate(async () => {
  const C = await import('./js/modes/ultimate/cast.js');
  const U = await import('./js/modes/ultimate.js');
  await C.loadCast();
  const list = C.castList();
  const all = (k) => list.every((c) => c.lines[k].length > 0 && c.lines[k].every((l) => l.text && l.phonemes));
  return { n: list.length, groups: [...new Set(list.map((c) => c.group))].sort(), voices: list.every((c) => c.voice),
    covered: U.EVENT_BACKGROUNDS.filter((s) => !C.castFor(s)), lines: ['greeting', 'callback', 'gift', 'story'].every(all),
    hints: list.every((c) => c.lines.story.some((l) => l.hint)), witch: (C.castFor('evt_amb_witch') || {}).group };
});
check(real.n === 26 && JSON.stringify(real.groups) === '[1,2,3,4,5,6,7,8]' && real.voices && real.covered.length === 0 && real.lines && real.hints && real.witch === 1,
  'the real cast is read: 26 characters in the eight groups, every safe zone background has one, every line has its phonemes, every character has hints: ' + JSON.stringify(real));

await page.evaluate(async () => {
  const g = window.__el.game; const a = window.__el.audio;
  const C = await import('./js/modes/ultimate/cast.js');
  const U = await import('./js/modes/ultimate.js');
  const mk = (who, kind, n, hint = false) => [...Array(n).keys()].map((i) => ({ id: `${who}-${kind}-${i}`, text: `${who} ${kind} line ${i}.`, phonemes: 'ðɪs', hint }));
  const stems = U.EVENT_BACKGROUNDS;
  // Eight characters, one for each group, sharing out every background.
  const cast = { characters: [...Array(8).keys()].map((k) => ({ id: `c${k + 1}`, name: `C${k + 1}`, voice: `v${k + 1}`, group: k + 1, backgrounds: stems.filter((_, i) => i % 8 === k) })) };
  const lines = { lines: Object.fromEntries(cast.characters.map((c) => [c.id, { greetings: mk(c.id, 'greet', 3), callbacks: mk(c.id, 'back', 2), gifts: mk(c.id, 'gift', 2), stories: [...mk(c.id, 'story', 2), ...mk(c.id, 'hint', 2, true)] }])) };
  C.setCast(C.normaliseCast(cast, lines));
  // A stand-in for the voice packs: a recording for every line, a short tone, decoded
  // the first time it is asked for (null that frame, as a real decode is a moment).
  window.__fake = {
    failed: new Set(), kept: new Map(), made: 0,
    has: (name) => name.startsWith('vc_'),
    peek(name) {
      if (this.kept.has(name)) return this.kept.get(name);
      this.made += 1;
      const b = a.ctx.createBuffer(1, 24000 * 0.6, 24000); const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 7) * 0.3;
      this.kept.set(name, b);
      return null;
    },
    release() {},
  };
  const t = window.__t = { said: [], device: [], played: [], C, U };
  const speak = g.tts.speak.bind(g.tts);
  g.tts.speak = (text, o) => { if (text) { t.said.push(text); if (o && o.device) t.device.push(text); } return speak(text, o); };
  const play = a.play.bind(a);
  a.play = (n, o) => { t.played.push(n); return play(n, o); };
  t.frames = (s, dt = 1 / 30) => { for (let i = 0; i < Math.round(s / dt); i++) { const u = g.ut; if (u) { u.worldTime = Math.max(u.worldTime, 100); u.safe = 999; } g.frame(dt); } };
  t.start = (engine) => {
    if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
    g.castVoices = null;
    g._utCastVoices().library = engine;
    g.scores.settings.turnTold = true;
    g.menuIndex = g.menuKeys.indexOf('ultimate'); g.input('enter'); g.frame(1 / 30);
    const u = g.ut;
    for (const e of u.enemies) if (e.voice) e.voice.stop();
    u.enemies = []; u.respawn.clear(); u.bus = null; u.busAt = null;
  };
  // Stand in a zone, `d` units from its character.
  t.goTo = (area, d) => {
    const u = g.ut; const w = area.who;
    const cells = area.floorCells.map(([x, y]) => [x * 3, y * 3]).filter((p) => Math.abs(Math.hypot(p[0] - w.pos[0], p[1] - w.pos[1]) - d) < 1.6);
    const p = cells[0] || w.pos;
    g.playerPos = [p[0], p[1]]; u.area = area; u.place = 'world';
    g._utRefreshRooms(); g._utListenerMix();
  };
  // (6.3.3) Exactly `d` units from them (they stand with room all round: clearance 6).
  t.goAt = (area, d) => {
    const u = g.ut; const w = area.who;
    g.playerPos = [w.pos[0] + d, w.pos[1]]; u.area = area; u.place = 'world';
    g._utRefreshRooms(); g._utListenerMix();
  };
});

// ------------------------------------------------------------------ where they stand, and greetings
const r1 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start(window.__fake);
  const u = g.ut; const C = t.C;
  const zones = u.world.areas.filter((a) => a.kind === 'event');
  const withWho = zones.filter((a) => a.who);
  const ids = withWho.map((a) => a.who.ch.id);
  const out = { zones: zones.length, withWho: withWho.length, chars: new Set(zones.map((z) => (C.castFor(z.stem) || {}).id).filter((x) => x)).size, unique: new Set(ids).size === ids.length,
    inside: withWho.every((a) => g.ut.world.floor.has(`${Math.round(a.who.pos[0] / 3)},${Math.round(a.who.pos[1] / 3)}`)) };
  const a = withWho[0];
  t.zone = a;
  t.goTo(a, 20);
  t.played.length = 0;
  for (let i = 0; i < 40; i++) { t.frames(0.5); await new Promise((r) => setTimeout(r, 30)); }
  const greets = t.played.filter((n) => /^ut_cast_.*greet/.test(n));
  out.greets = greets.length;
  const v = [...u.voices, ...u.shots].find((x) => /^ut_cast_/.test(x.name));
  out.placed = !!(v && v.placed);
  out.state = a.who.state;
  out.device = t.device.length;
  // Only each character's latest line stays in the sound engine (an evening hears hundreds).
  out.kept = [...g.audio.buffers.keys()].filter((k) => k.startsWith('dry:ut_cast_')).length;
  return out;
});
check(r1.greets >= 2 && r1.kept === 1, 'only their latest line is kept in memory: ' + JSON.stringify([r1.greets, r1.kept]));
check(r1.withWho >= 1 && r1.withWho === r1.chars && r1.unique && r1.inside, 'every safe zone has its character, standing in it, each character in one zone a world: ' + JSON.stringify(r1));
check(r1.greets >= 2 && r1.placed && r1.state === 'greet' && r1.device === 0, 'in their zone they greet you every few seconds, in their own voice, placed where they stand: ' + r1.greets);

// ------------------------------------------------------------------ the story, then the gift
const r2 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const u = g.ut; const a = t.zone; const w = a.who;
  // (Web 6.3.3, Russell: the story and the gift begin when you step onto their square or
  // the one beside it, not two steps away.) Two steps off, they only greet.
  t.goAt(a, 5.0);
  for (let i = 0; i < 30; i++) { t.frames(0.1); await new Promise((r) => setTimeout(r, 10)); }
  const twoSteps = w.state;
  t.goAt(a, 2.5);
  t.played.length = 0; t.said.length = 0;
  const ammo = u.ammo; const hp = u.hp; const items = u.items;
  for (let i = 0; i < 200 && w.state !== 'done'; i++) { t.frames(0.1); await new Promise((r) => setTimeout(r, 30)); }
  const out = { twoSteps, state: w.state, story: t.played.some((n) => /^ut_cast_.*-(story|hint)-/.test(n)), giftLine: t.played.some((n) => /^ut_cast_.*-gift-/.test(n)),
    words: u.lastGift && u.lastGift.words, said: t.said.slice(), group: w.ch.group, dAmmo: u.ammo - ammo, dHp: u.hp - hp, dItems: u.items - items,
    heard: (g.scores.settings.storyHeard || []).includes(w.told.id) };
  // A second visit: nothing more this world.
  t.played.length = 0;
  t.frames(6);
  out.after = t.played.filter((n) => /^ut_cast_/.test(n)).length;
  return out;
});
check(r2.twoSteps === 'greet', 'two steps away they only greet: the story waits until you are with them (' + r2.twoSteps + ')');
check(r2.story && r2.giftLine && r2.state === 'done', 'on their square or the one beside it they tell a story line, then give a gift with a line of their own: ' + JSON.stringify([r2.story, r2.giftLine, r2.state]));
check(/^You've just received /.test(r2.words || '') && r2.said.includes(r2.words), 'the in-run voice says what you received: ' + r2.words);
check(r2.heard, 'the story line is remembered as heard (saved with the settings)');
check(r2.after === 0, 'one gift a character, each world: afterwards they are quiet');

// ------------------------------------------------------------------ walking away: they talk on, the gift waits, they call you back
const r3 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const u = g.ut;
  const zones = u.world.areas.filter((x) => x.who && x.who.state === 'greet');
  let a = zones[0];
  if (!a) { t.start(window.__fake); a = g.ut.world.areas.find((x) => x.who); }
  const uu = g.ut; const w = a.who;
  t.goAt(a, 2.5);
  for (let i = 0; i < 60 && w.state === 'greet'; i++) { t.frames(0.1); await new Promise((r) => setTimeout(r, 20)); }
  const out = { telling: w.state };
  // Walk off, to the far side of the zone.
  t.goTo(a, 24);
  const talkingOn = !!(w.voice && w.voice.busy);
  for (let i = 0; i < 80 && w.state === 'telling'; i++) { t.frames(0.1); await new Promise((r) => setTimeout(r, 20)); }
  out.talkingOn = talkingOn; out.waiting = w.state;
  t.played.length = 0;
  for (let i = 0; i < 24; i++) { t.frames(0.5); await new Promise((r) => setTimeout(r, 20)); }
  out.callbacks = t.played.filter((n) => /^ut_cast_.*-back-/.test(n)).length;
  out.stillWaiting = w.state;
  t.goAt(a, 2.5);
  for (let i = 0; i < 100 && w.state !== 'done'; i++) { t.frames(0.1); await new Promise((r) => setTimeout(r, 20)); }
  out.gave = w.state;
  return out;
});
check(r3.telling === 'telling' && r3.talkingOn && r3.waiting === 'waiting', 'walk away while they talk and they talk on; the gift waits: ' + JSON.stringify(r3));
check(r3.callbacks >= 1 && r3.stillWaiting === 'waiting' && r3.gave === 'done', 'they call you back now and then, and give the gift when you return: ' + r3.callbacks);

// ------------------------------------------------------------------ the eight groups' gifts, the rare ones, the mercy
const r4 = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const u = g.ut; const C = t.C;
  const zone = u.world.areas.find((x) => x.kind === 'event');
  const out = { groups: {}, health: {} };
  const realRand = Math.random;
  const give = (group, forced = null) => {
    zone.who = { ch: { ...C.castList()[group - 1], group }, pos: [0, 0], state: 'giving', told: null };
    const before = { ammo: u.ammo, hp: u.hp, items: u.items, time: u.worldTime, clock: g.timeLeft };
    const D = t.U.GIFT_DICE; const realRoll = D.roll;
    if (forced) { let k = 0; D.roll = () => (k < forced.length ? forced[k++] : realRand()); }
    try { g._utCastGive(zone); } finally { D.roll = realRoll; }
    return { words: u.lastGift.words, dAmmo: u.ammo - before.ammo, dHp: u.hp - before.hp, dItems: u.items - before.items, dTime: Math.round(u.worldTime - before.time), dClock: Math.round(g.timeLeft - before.clock) };
  };
  for (let gr = 1; gr <= 8; gr++) {
    const seen = [];
    for (let i = 0; i < 40; i++) { u.hp = 100; seen.push(give(gr, [0.5])); }
    out.groups[gr] = { ammo: seen.some((s) => s.dAmmo > 0), hp: seen.some((s) => s.dHp > 0), items: seen.some((s) => s.dItems > 0), words: seen[0].words,
      over: seen.some((s) => s.dHp > 0) ? Math.max(...seen.map((s) => s.dHp)) : 0 };
  }
  u.hp = 100;
  out.minutes = give(3, [0.0, 0.0, 0.5]);
  const chests = u.pickups.filter((p) => p.kind === 'chest').length;
  const opened = u.chests || 0; const played0 = t.played.length;
  out.chest = give(3, [0.0, 0.9, 0.5, 0.5, 0.5, 0.5]);
  out.chestPlaced = u.pickups.filter((p) => p.kind === 'chest').length === chests;     // (none placed now)
  out.chestOpened = (u.chests || 0) === opened + 1 && t.played.slice(played0).some((n) => n === 'evt_chest_open' || n === 'treasure_pickup');
  // The mercy: only after a hint.
  t.said.length = 0;
  zone.who = { ch: { ...C.castList()[2], group: 3 }, pos: [0, 0], state: 'giving', told: { id: 'x', hint: true } };
  const time = u.worldTime;
  const D = t.U.GIFT_DICE; const realRoll = D.roll;
  D.roll = () => 0.2;   // no rare gift (0.2 is over 0.1), and the mercy (0.2 is under 0.3)
  try { g._utCastGive(zone); } finally { D.roll = realRoll; }
  out.mercy = { dTime: Math.round(u.worldTime - time), said: t.said.slice() };
  zone.who = { ch: { ...C.castList()[2], group: 3 }, pos: [0, 0], state: 'giving', told: { id: 'y', hint: false } };
  const time2 = u.worldTime;
  D.roll = () => 0.2;
  try { g._utCastGive(zone); } finally { D.roll = realRoll; }
  out.noMercy = Math.round(u.worldTime - time2);
  zone.who = null;
  return out;
});
const G = r4.groups;
check(G[1].ammo && G[1].hp && G[1].over > 100 - 100 + 14, 'spooky: ammo or health, and now and then health over 100: ' + JSON.stringify(G[1]));
check(G[2].ammo && !G[2].hp && G[2].words === "You've just received 6 shots of ammo.", 'towns and travel: a full cartridge: ' + G[2].words);
check(!G[3].ammo && G[3].hp && /^You've just received \d+ health\.$/.test(G[3].words), 'kitchens: a meal, health: ' + G[3].words);
check(G[4].ammo && /^You've just received 1[2-5] shots of ammo\.$/.test(G[4].words), 'fire and hearth: an extra-big cartridge: ' + G[4].words);
check(G[5].hp && !G[5].ammo, 'holy and quiet: health, sometimes a little over 100: ' + JSON.stringify(G[5]));
check(G[6].ammo && G[6].hp && /shots of ammo and \d+ health\.$/.test(G[6].words), 'water: a little ammo and a little health: ' + G[6].words);
check(G[7].items && !G[7].ammo && /tower items\.$/.test(G[7].words), 'wild nature: tower items: ' + G[7].words);
check(G[8].ammo && G[8].hp && G[8].items, 'cold, storms, machines and space: a little of everything: ' + G[8].words);
check(r4.minutes.dTime === 120 && r4.minutes.words === "You've just received 2 more minutes in this world.", 'rare: two more minutes in this world: ' + r4.minutes.words);
check(r4.chestPlaced && r4.chest.words === "You've just received a treasure chest." && r4.chestOpened, 'rare: a treasure chest, put in your hands and opened at once, with its sound (7.2.17): ' + JSON.stringify([r4.chestPlaced, r4.chestOpened]));
check(r4.mercy.dTime === 35 && r4.mercy.said.includes('The world shows you mercy. 35 more seconds.') && r4.noMercy === 0, 'the world\'s mercy, only after a hint: ' + JSON.stringify(r4.mercy));

// ------------------------------------------------------------------ the mystery: unheard lines first
const r5 = await page.evaluate(() => {
  const g = window.__el.game; const t = window.__t; const C = t.C;
  const ch = C.castList()[0];
  const s = { storyHeard: [] };
  const got = [];
  for (let i = 0; i < ch.lines.story.length; i++) { const ln = C.pickStory(ch, s); got.push(ln.id); C.noteHeard(s, ln); }
  const next = C.pickStory(ch, s);
  return { distinct: new Set(got).size, n: ch.lines.story.length, restarted: !!next && s.storyHeard.filter((id) => id.startsWith(ch.id)).length === 0 };
});
// Two lines heard and saved one after the other are both still there when read back
// from storage (the second was once lost: the list had been added to in place).
const r5b = await page.evaluate(async () => {
  const { noteHeard } = await import('./js/modes/ultimate/cast.js');
  const g = window.__el.game; const st = g.scores;
  const before = (st.settings.storyHeard || []).length;
  noteHeard(st.settings, { id: 'test.story.a' }); st.save();
  noteHeard(st.settings, { id: 'test.story.b' }); st.save();
  const all = Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k) || '').join('\n');
  const saved = ['test.story.a', 'test.story.b'].filter((id) => all.includes(id));
  saved.length = saved.length;
  return { a: saved.includes('test.story.a'), b: saved.includes('test.story.b'), grew: (st.settings.storyHeard || []).length - before };
});
check(r5b.a && r5b.b && r5b.grew === 2, 'every heard line is saved, the second as well as the first: ' + JSON.stringify(r5b));
check(r5.distinct === r5.n && r5.restarted, 'unheard story lines come first; when all are heard they start over: ' + JSON.stringify(r5));

// ------------------------------------------------------------------ without their own voice: the device's, with a beacon, whatever the Speech setting
const r6 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t;
  t.start(null);
  const u = g.ut; const a = u.world.areas.find((x) => x.who);
  t.goTo(a, 20);
  t.device.length = 0; t.played.length = 0;
  t.frames(8);
  const out = { device: t.device.length, beacon: t.played.includes('event_beacon_shimmer') };
  // The Speech setting silenced (Braille only): still heard, straight through the browser's speech.
  const sp = window.__el.speech; const realMuted = sp.muted;
  const spoken = []; const synth = window.speechSynthesis; const realSpeak = synth.speak.bind(synth);
  synth.speak = (u2) => { spoken.push(u2.text); };
  sp.muted = () => true;
  a.who.timer = 0; a.who.until = 0;
  t.frames(1);
  sp.muted = realMuted; synth.speak = realSpeak;
  out.mutedHeard = spoken.length;
  return out;
});
check(r6.device >= 1 && r6.beacon, 'without their recordings the device\'s voice says their lines, and a shimmering beacon marks where they stand');
check(r6.mutedHeard >= 1, 'and they are heard even with the Speech setting off (Braille only)');

// ------------------------------------------------------------------ a chaos world stage: the two minutes add to the chaos clock too
const r7 = await page.evaluate(async () => {
  const g = window.__el.game; const t = window.__t; const C = t.C;
  if (g.state !== 'menu') { g._stopRunSounds(); g.runId += 1; g.state = 'menu'; g._refreshMenu(); }
  g._chaosPickNext = () => 'ultimate';
  g.menuIndex = g.menuKeys.indexOf('chaos'); g.input('enter'); g.frame(1 / 30);
  const u = g.ut;
  const zone = u.world.areas.find((x) => x.kind === 'event');
  zone.who = { ch: { ...C.castList()[2], group: 3 }, pos: [0, 0], state: 'giving', told: null };
  const before = { time: u.worldTime, clock: g.timeLeft };
  const D = t.U.GIFT_DICE; const realRoll = D.roll; const seq = [0.0, 0.0, 0.5]; let k = 0;
  D.roll = () => seq[Math.min(k++, seq.length - 1)];
  try { g._utCastGive(zone); } finally { D.roll = realRoll; }
  const out = { dTime: Math.round(u.worldTime - before.time), dClock: Math.round(g.timeLeft - before.clock), words: u.lastGift.words };
  g._stopRunSounds(); g.runId += 1; g.state = 'menu';
  delete g._chaosPickNext;
  return out;
});
check(r7.dTime === 120 && r7.dClock === 210, 'in a chaos world stage the two minutes add two minutes to the world and three and a half to the chaos clock: ' + JSON.stringify(r7));

check(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
