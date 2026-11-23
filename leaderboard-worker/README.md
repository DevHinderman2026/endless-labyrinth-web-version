# The weekly leaderboard's relay

Web 7.2.0. The game sends every Chaos Mode score (points, the run's length and the device's random ID, nothing else) to this small Cloudflare Worker. The Worker checks the score and keeps each device's best of the week in a public GitHub repository, `DevHinderman2026/Endless-Labyrinth-score-leaderboard`, one file a week (`weeks/<Monday>.json`, by Eastern time). The website reads that repository to show the board.

The Worker exists because a web page cannot write to GitHub on its own: writing needs a secret key, and everything in a web page can be read by anyone. The key lives only in Cloudflare, as a secret.

## What it refuses

- Anything not sent from the website itself (`ALLOWED_ORIGINS`).
- A device ID that is not 32 hexadecimal characters, a score that is not a whole number from 1 up, and a run under ten seconds or over six hours.
- More points than `MAX_PER_MINUTE` for each minute played (2000).
- A second score from the same device within `MIN_GAP` seconds (20).

Nobody can make themselves the winner this way: the week's winner is the developer's decision, signed with the event key in the Event Maker, and the game believes only a signed result.

## Setting it up (once)

1. **The scores repository.** On GitHub, create a new **public** repository named `Endless-Labyrinth-score-leaderboard` under DevHinderman2026, with a README. Nothing else goes in it: the Worker writes the `weeks` folder.
2. **The key.** On GitHub: Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token. Name it "Leaderboard relay". Resource owner: DevHinderman2026. Expiration: one year (put a reminder to renew it). Repository access: Only select repositories, `Endless-Labyrinth-score-leaderboard`. Permissions, Repository permissions, Contents: Read and write. Generate it, and copy it: it is shown once.
3. **The Worker.** In the Cloudflare dashboard: Workers and Pages, Create, Create Worker, name it `el-leaderboard`, Deploy. Then Edit code, replace everything with the contents of `worker.js`, and Deploy again.
4. **Its settings.** In the Worker: Settings, Variables and Secrets. Add four plain variables, `SCORES_REPO` = `DevHinderman2026/Endless-Labyrinth-score-leaderboard`, `ALLOWED_ORIGINS` = `https://devhinderman2026.github.io`, `MAX_PER_MINUTE` = `2000`, `MIN_GAP` = `20`; and one **secret**, `GITHUB_TOKEN`, pasting the key from step 2. Deploy.
5. **Its address.** The Worker's address is shown on its page, like `https://el-leaderboard.<your name>.workers.dev`. Opening it in a browser answers `{"ok":true, ...}`. Give that address to Claude: it goes into `RELAY_URL` in `js/leaderboard.js`, and from that release on the game sends scores.

`wrangler.toml` holds the same settings for anyone who deploys from the command line (`npx wrangler deploy`, then `npx wrangler secret put GITHUB_TOKEN`).

## The tests

`node tests/leaderboard-worker.mjs` runs the Worker in Node, with GitHub played by a stand-in.
