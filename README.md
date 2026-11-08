# Endless Labyrinth: web version

A 3D audio game for phones, tablets and computers, played by ear with headphones: touch gestures on a phone or tablet, the keyboard on a computer. It is the web version of the Windows game [Endless Labyrinth](https://github.com/DevHinderman2026/Endless-Labyrinth), with all six of its modes (Standard, Battle, Driving, Tower, Island and Chaos) and its events, and the same rules, timings and sounds, plus one mode of its own: Ultimate Test Mode (web 2.0.0), a survival mode in one huge, regenerating world, heard in binaural 3D, which the Windows game does not have. As of November 2026 the whole game, which began on Windows, is fully playable in a browser.

**Play:** open the game's website on an iPhone, iPad (iOS 18.4 or newer), Android phone or tablet (an up-to-date Chrome), Chromebook, Mac or Linux computer, with headphones. A Windows computer plays Ultimate Test Mode only, and is pointed to the Windows version for the rest.

## What is here

- `index.html`, `about.html`, `story.html`, `credits.html`, `history.html`, `events.html`, `stats.html`, `backups.html`, `accessibility.html`, `help.html`, `terms.html`, `privacy.html`, `accessibility-statement.html`: the website. `faq.html` only forwards to `help.html#faq`, where the frequently asked questions now live (web 1.3.0). `about.html` teaches how to play, gestures and keys included. `history.html` is the Update History, the players' release notes: each new version goes at the top, with its date and what changed for players. The web version has its own version numbers (1.4.0 now), separate from the Windows game's. Whenever `terms.html` or `privacy.html` changes, regenerate `TERMS.md` and `PRIVACY.md` in the Windows repository with its `Developer Tools/html2md.py`. The site links and the footer (contact, the legal pages and the share buttons) are built on every page by `js/site.js`, from one list: a new page is added there once.
- `play.html`: the game.
- `js/`: the game.
  - `game.js`: Standard and Battle modes, the menus and help, ported from the Windows game's `endless_labyrinth.py` (Windows version 1.0.1), with the same names and numbers so the two can be compared.
  - `modes/`: the other modes, each a plug-in listed in `modes/index.js`: `driving.js`, `tower.js`, `island.js`, `chaos.js`, `ultimate.js` (Ultimate Test Mode, web 2.0.0, with `ultimate/world.js`, the world generator, and `ultimate/help.js`) and `events.js` (with `events/`, the port of the desktop's event engine, missions, schema and signature check).
  - `device.js`: tells iPhones, iPads, Android phones and tablets, Chromebooks, Macs and Linux computers apart; a Windows computer is let in for Ultimate Test Mode alone (`windowsOnly`). An iPhone is told from an iPad by the size of its screen (web 1.1.0).
  - `site.js`: the site links, the footer and the share buttons on every page of the website. `update-alert.js` (home page only, web 1.4.0): the Windows update alert, an alert region shown for thirty days after the latest Windows release on GitHub, judged by internet time. `display.js`: the display options (high contrast, bigger text) applied on every page. `calendar.js`, `stats.js`, `backup.js` and `backups-page.js`, `accessibility.js`, `help-page.js` (the Help page, built from the game's own help; demos read one sound at a time with `packs.js` `openPacks`): the Events calendar, Game Stats, Score Backups, Accessibility and Help pages.
  - `audio.js`: the sound engine, the desktop's mixer rebuilt on the Web Audio API: left and right levels, the dull "behind you" copy, and the room echo. For Ultimate Test Mode (`spatial`): HRTF panners for every placed sound, an echo bus per area with the room's impulse stretched to the area's size, and a world gain and low-pass for the regeneration fades and the compass.
  - `gestures.js`: touch gestures turned into the game's keys, including running (slide up and hold) and walking backwards (slide down and hold, since web 1.4.0), which the game steps in `game.js`, and the held finger that is Ultimate Test Mode's compass (web 2.0.0; C on a keyboard). A Bluetooth keyboard works too.
  - `speech.js`: the game's own voice, through the browser.
  - `packs.js`: downloads the sound packs once and keeps them on the device.
  - `storage.js`: high scores, settings and stats (time played and runs per mode, since web 1.1.0; save format 2), kept on the device. Event runs are kept beside them by `modes/events/feed.js`.
  - `help-data.js`: the help menu.
  - `sound-rules.js`: made from the desktop game by the pack builder, which also writes the Credits page's list. Do not edit them by hand.
- `packs/`: the sound packs and `manifest.json`, which names them. No sound is ever on the site as its own file: everything travels inside the packs.
- `tests/`: end-to-end checks in a real browser engine (see below): `smoke.mjs`, one file per mode (`ultimate.mjs`, `ultimate-edges.mjs` and `ultimate-sound.mjs` for Ultimate Test Mode, the last measuring its echoes with an AnalyserNode, with `world.mjs` for its generator in Node alone and `ultimate-soak.mjs`, a longer run that watches memory, not part of the quick suite), `devices.mjs`, `computers.mjs`, `stride.mjs` (running and walking backwards on a touch screen), `keywords.mjs`, `eventwords.mjs`, and for the website's pages `calendar.mjs`, `stats.mjs`, `backups.mjs`, `accessibility.mjs`, `legal.mjs`, `share.mjs` and `help.mjs`.

## The sound packs

The packs are built from the desktop game itself, by a private tool kept with the desktop game's developer tools (`Developer Tools/Web Packs/build_web_packs.py`). It loads the desktop game's sounds with the desktop's own code, so the generated beacons, enemies and chimes are exactly the same, and adds each sound's "behind you" copy and the rooms' echo responses. Each pack's file name carries a fingerprint of its contents, so players download a pack again only when it has changed. A pack over 25 MB (the events' sound library) is written in parts (`events`, `events2`, `events3`), so no file comes near GitHub's 50 MB warning. The `ultimate` pack holds the one recording that exists only in the web version (the diver's breathing on Ultimate Test Mode's seabed), kept with the tool as a finished loop (`Web Packs/web-only/`) and credited in the desktop's CREDITS.md like every other recording.

## Testing

Serve this folder (`python3 -m http.server 8765`), then run `node tests/smoke.mjs http://localhost:8765` (and every other file in `tests/` the same way; `calendar.mjs` and `events.mjs` take the desktop repository's folder as a second argument, for its published events) with Playwright installed. Where the browser cannot reach GitHub, add `--import ./tests/github-stub.mjs`. They load the packs, play every mode by script and drive the gestures with synthetic touches. It cannot hear: how the game sounds, and how the gestures feel on a real phone, are checked by playing.

## Publishing

The site is published with GitHub Pages from the `main` branch (Settings, Pages, Deploy from a branch, `main`, root folder). The repository must be public for that.

## License

All rights reserved. See [LICENSE.md](LICENSE.md). The recorded sounds come from Pixabay and are credited on the [Credits page](credits.html).
