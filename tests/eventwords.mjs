// Event descriptions are written for a keyboard; spoken on a phone, the keys they
// name become gestures. Run: node tests/eventwords.mjs (no browser needed).
import { gestureWords } from '../js/modes/events/engine.js';

let failures = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) failures += 1; };
const cases = [
  ['Walk with the arrow keys; Enter tells you your score, and T the time left.', 'Walk by swiping; A double tap tells you your score and the time left.'],
  ['Enter tells you how many are left, and T the time.', 'A double tap tells you how many are left and the time.'],
  ['Left and Right turn you and take a step, but they never touch a bell.', 'Swipes left and right turn you and take a step, but they never touch a bell.'],
  ['then step forward or back onto it with Up or Down.', 'then step forward or back onto it with a swipe up or down.'],
  ['Press Space to send a sonar ping.', 'Tap with two fingers to send a sonar ping.'],
  ['Face it and press Space to fire.', 'Face it and tap with two fingers to fire.'],
  ['Shoot them with Space before they reach it.', 'Shoot them with a two-finger tap before they reach it.'],
  ['Bring them all down with the laser on Space, aimed like battle mode.', 'Bring them all down with the laser, a two-finger tap, aimed like battle mode.'],
  ['Press the arrow toward it as fast as you can. The wrong arrow costs a life.', 'Swipe toward it as fast as you can. The wrong swipe costs a life.'],
  ['Five misses, whether pressing off the beat or missing one.', 'Five misses, whether tapping off the beat or missing one.'],
  ['In each cell a bunch of keys jingles somewhere.', 'In each cell a bunch of keys jingles somewhere.'],
  // Web 5.0.0
  ['Enter tells you how you are doing. T tells you the time left.', 'A double tap tells you how you are doing.'],
  ['Enter tells you how you are doing. T tells you the time left in the stage.', 'A double tap tells you how you are doing.'],
  ['Then press Space to smash it: ten points.', 'Then tap with two fingers to smash it: ten points.'],
  ['Find each case by its knocking and smash it with Space.', 'Find each case by its knocking and smash it with a two-finger tap.'],
  ['Away from a case, Space fires your laser at whatever is centred between your ears.', 'Away from a case, a two-finger tap fires your laser at whatever is centred between your ears.'],
  ['Space fires your laser, and three hits bring a beast down.', 'A two-finger tap fires your laser, and three hits bring a beast down.'],
  ['Pick up pebbles and throw them with Space, the way you last stepped.', 'Pick up pebbles and throw them with a two-finger tap, the way you last stepped.'],
  ['Space plays the path again twice in each crossing.', 'A two-finger tap plays the path again twice in each crossing.'],
  ['If a crate is stuck, Space puts it somewhere new for five points.', 'If a crate is stuck, a two-finger tap puts it somewhere new for five points.'],
  ['Space sends a ping.', 'A two-finger tap sends a ping.'],
  ['now press the arrow keys in the same order, Up for ahead, Down for behind, Left and Right.', 'now swipe in the same order: up for ahead, down for behind, left and right.'],
  ['A wrong arrow, or waiting too long, costs a life.', 'A wrong swipe, or waiting too long, costs a life.'],
  ['North is straight ahead, the Up arrow.', 'North is straight ahead, a swipe up.'],
  ['Enter repeats the directions as they were read.', 'A double tap repeats the directions as they were read.'],
];
for (const [from, to] of cases) {
  const got = gestureWords(from);
  check(got === to, `"${from}" -> "${got}"`);
}
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
