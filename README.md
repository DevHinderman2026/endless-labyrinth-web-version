# Endless Labyrinth: web version

A 3D audio game for phones and tablets, played by ear with headphones and touch gestures. It is the web version of the Windows game [Endless Labyrinth](https://github.com/DevHinderman2026/Endless-Labyrinth), with all six of its modes (Standard, Battle, Driving, Tower, Island and Chaos) and its events, and the same rules, timings and sounds. As of November 2026 the whole game, which began on Windows, is fully playable in a mobile browser.

**Play:** open the game's website on an iPhone, iPad (iOS 18.4 or newer) or Android phone or tablet (an up-to-date Chrome), with headphones. Computers are not supported; on a computer, play the Windows version.

## What is here

- `index.html`, `about.html`, `credits.html`, `history.html`: the website. `about.html` teaches how to play, gestures included. `history.html` is the Update History, the players' release notes: each new version goes at the top, with its date and what changed for players.
- `play.html`: the game.
- `js/`: the game.
  - `game.js`: Standard and Battle modes, the menus and help, ported from the desktop game's `endless_labyrinth.py` (version 1.0.1), with the same names and numbers so the two can be compared.
  - `modes/`: the other modes, each a plug-in listed in `modes/index.js`: `driving.js`, `tower.js`, `island.js`, `chaos.js` and `events.js` (with `events/`, the port of the desktop's event engine, missions, schema and signature check).
  - `device.js`: tells phones and tablets from computers, which are not supported.
  - `audio.js`: the sound engine, the desktop's mixer rebuilt on the Web Audio API: left and right levels, the dull "behind you" copy, and the room echo.
  - `gestures.js`: touch gestures turned into the game's keys. A Bluetooth keyboard works too.
  - `speech.js`: the game's own voice, through the browser.
  - `packs.js`: downloads the sound packs once and keeps them on the device.
  - `storage.js`: high scores and settings, kept on the device.
  - `help-data.js`: the help menu.
  - `sound-rules.js` and `credits-data.js`: made from the desktop game by the pack builder. Do not edit them by hand.
- `packs/`: the sound packs and `manifest.json`, which names them. No sound is ever on the site as its own file: everything travels inside the packs.
- `tests/`: end-to-end checks in a real browser engine (see below): `smoke.mjs`, and one file per mode.

## The sound packs

The packs are built from the desktop game itself, by a private tool kept with the desktop game's developer tools (`Developer Tools/Web Packs/build_web_packs.py`). It loads the desktop game's sounds with the desktop's own code, so the generated beacons, enemies and chimes are exactly the same, and adds each sound's "behind you" copy and the rooms' echo responses. Each pack's file name carries a fingerprint of its contents, so players download a pack again only when it has changed. A pack over 25 MB (the events' sound library) is written in parts (`events`, `events2`, `events3`), so no file comes near GitHub's 50 MB warning.

## Testing

Serve this folder (`python3 -m http.server 8765`), then run `node tests/smoke.mjs http://localhost:8765` (and `tower.mjs`, `island.mjs`, `driving.mjs`, `events.mjs`, `chaos.mjs` the same way) with Playwright installed. Where the browser cannot reach GitHub, add `--import ./tests/github-stub.mjs`. They load the packs, play every mode by script and drive the gestures with synthetic touches. It cannot hear: how the game sounds, and how the gestures feel on a real phone, are checked by playing.

## Publishing

The site is published with GitHub Pages from the `main` branch (Settings, Pages, Deploy from a branch, `main`, root folder). The repository must be public for that.

## License

All rights reserved. See [LICENSE.md](LICENSE.md). The recorded sounds come from Pixabay and are credited on the [Credits page](credits.html).
