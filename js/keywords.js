// On a computer (Chromebook, Mac or Linux), the game is played with the keyboard,
// with the same keys as the Windows game. Everything the game says or shows is
// written for touch gestures; on a computer it passes through keyWords first, which
// turns the gestures into those keys. Phones and tablets never use this.
//
// Whole sentences that need rewording come first, then single phrases. The order
// matters: longer phrases before the shorter ones inside them.

const SENTENCES = [
  // Web 5.0.0: the walking modes turn with you (General Gestures, General Turning
  // and the modes' own help). On a computer an arrow can be held, to turn or to run.
  [/In a menu, swipe up and down to move through it\./g, 'In a menu, use the up and down arrows to move through it.'],
  [/flick left or right for a quick turn of 30 degrees, and swipe up to take one step the way you are facing, or down to take one step straight back\./g,
    'press the left or right arrow for a quick turn of 30 degrees, and the up arrow to take one step the way you are facing, or the down arrow to take one step straight back.'],
  [/Slide a finger left or right and keep it on the screen, and you keep turning for as long as it stays there, moving or resting, and stop the moment you lift it\. What tells a flick from a slide is only how soon the finger lifts\./g,
    'Hold the left or right arrow down and you keep turning until you let go. A press let go at once is always one quick turn.'],
  [/Slide a finger up and hold it there to run: you keep stepping forward, fast, for as long as that finger stays on the screen\. Slide a finger down and hold it there to walk backwards, more slowly, for as long as it stays there\. On a touch screen you cannot turn while you run: lift, turn, then run again\. A finger resting still on the screen does nothing, except in Ultimate Mode, where holding it still for about a second turns the compass on or off\. Only lifting your finger stops you, and you also stop by yourself at a wall, at the edge of an arena, and whenever a new level begins\. Lift your finger, too, before you shoot or tap\./g,
    'In those modes, hold the up arrow down to run and the down arrow to walk backwards, and let go to stop; you also stop by yourself at a wall, at the edge of an arena, and whenever a new level begins. You can turn while you run: press or hold the left or right arrow as well, and your run curves. In Ultimate Mode, press C for the compass.'],
  [/and in an event each swipe up, down, left or right is one step that way\./g, 'and in an event each press of an arrow key is one step that way.'],
  [/Double tap to choose, like Enter\. In menus, triple tap goes back, and four taps open help\./g, 'Press Enter to choose. In menus, Escape goes back, and H opens help.'],
  [/The main menu has a Gesture Practice, which says the name of every gesture it feels, running, walking backwards, turning and the held finger included\. /g, ''],
  [/Flick left or right for a quick turn of 30 degrees, so three flicks are a quarter turn, from one main direction to the next, and six turn you right round\./g,
    'Press the left or right arrow for a quick turn of 30 degrees, so three presses are a quarter turn, from one main direction to the next, and six turn you right round.'],
  [/Slide left or right and keep your finger down to keep turning; lift to stop exactly there\./g, 'Hold the left or right arrow down to keep turning; let go to stop exactly there.'],
  [/Then swipe up to walk the way you are facing\./g, 'Then press the up arrow to walk the way you are facing, or hold it down to run.'],
  [/A double tap's report ends with the way you are facing/g, 'Enter\'s report ends with the way you are facing'],
  [/Flick left or right to turn 30 degrees, or slide left or right and keep your finger down to keep turning\./g, 'Press the left or right arrow to turn 30 degrees, or hold one down to keep turning.'],
  [/flick left or right to turn 30 degrees, slide and keep your finger down to keep turning, and swipe up to walk the way you face/g,
    'press the left or right arrow to turn 30 degrees, hold one down to keep turning, and press the up arrow to walk the way you face'],
  [/flick left or right to turn, swipe up to walk the way you face, and your facing carries/g, 'press the left or right arrow to turn, press the up arrow to walk the way you face, and your facing carries'],
  [/Turn toward it, with a flick or a slide, until/g, 'Turn toward it, with a press or a held arrow, until'],
  [/flick twice to one side first, then step/g, 'press the left or right arrow twice first, then step'],
  // General Gestures, which becomes General Keys.
  [/Your screen reader must be off while you play, because the game listens to the screen itself and speaks with its own voice\./g,
    'Your screen reader must be off while you play, because the game listens to the keyboard itself and speaks with its own voice.'],
  // Running and walking backwards are touch gestures only (web 1.2.0): a keyboard
  // has none, so on a computer the sentences go.
  [/During a run, slide a finger up and hold it there to run: you keep stepping forward, fast, for as long as that finger stays on the screen\. Slide a finger down and hold it there to walk backwards, more slowly, for as long as it stays there\. A finger resting still on the screen does nothing, except in Ultimate Mode, where holding it still for about a second turns the compass on or off\. Only lifting your finger stops you, and you also stop by yourself at a wall, at the edge of an arena, and whenever a new level begins\. Turning is unchanged: lift your finger, then swipe left or right\. Lift it, too, before you shoot or tap\. /g, ''],
  [/Swipe up, down, left or right to move, or to move through a menu\. Double tap to choose, like Enter\. In menus, triple tap goes back, and four taps open help\./g,
    'Use the arrow keys to move, or to move through a menu. Press Enter to choose. In menus, Escape goes back, and H opens help.'],
  [/Tap with two fingers to attack, the same as the spacebar on a computer, whether that is the laser, a throw or a shot down the road\./g,
    'Press Space to attack, whether that is the laser, a throw or a shot down the road.'],
  [/Tap with three fingers to pause, and again to resume\. During a run, only the double tap is counted, so it acts at once and an extra tap can never end your run by accident: to leave a run or open help, pause first with three fingers, then triple tap to quit or tap four times for help\./g,
    'Press P to pause, and again to resume. To leave a run, press Escape; to open help during a run, pause first with P, then press H.'],
  [/A single tap does nothing\. /g, ''],
  // Ultimate Mode turns you where you stand (web 4.0.0); on a computer its arrows
  // can be held, as nowhere else but the road.
  [/Ultimate Mode alone turns you where you stand: there a swipe left or right is a turn, not a step, sliding left or right and holding keeps you turning until you lift, and you walk the way you face; that mode's own help section explains\. /g,
    'Ultimate Mode alone turns you where you stand: there the left and right arrows turn you instead of stepping, an arrow held down keeps you turning or running until you let go, and you walk the way you face; that mode\'s own help section explains. '],
  [/Driving, in driving mode and on a chaos road, works its own way: put a finger on the screen and slide it up, and the car accelerates for as long as that finger stays on the screen\. Lift it and the car coasts\. Swipe down to brake: each swipe is one brake\. If your accelerating finger slides back down without lifting, it stops accelerating and brakes once\. To change lanes, lift your finger and swipe left or right\. To shoot or hear the report, lift first, then tap with two fingers or double tap as everywhere else; the car coasts meanwhile, and a second finger added while you are accelerating does nothing\./g,
    'Driving, in driving mode and on a chaos road, has a key you hold too: hold the up arrow and the car accelerates for as long as you hold it. Let go and the car coasts. Press the down arrow to brake: each press is one brake. Left and right arrows change lanes, and Space and Enter shoot and report as everywhere else.'],
  [/The main menu has a Gesture Practice, which says the name of every gesture it feels, running, walking backwards and the held finger included\. /g, ''],
  [/A Bluetooth keyboard works too, with the same keys as the computer version: the arrows, with the up arrow held down to accelerate, Enter, Space, Escape, P to pause, H for help, T for the clock and C for the compass in Ultimate Mode\./g,
    'These are the same keys as the Windows version: the arrows, with the up arrow held down to accelerate, Enter, Space, Escape, P to pause, H for help and T for the clock, and C for the compass in Ultimate Mode.'],
  [/General Gestures/g, 'General Keys'],
  // Sound on Your Device.
  [/On an iPhone or iPad, turn silent mode off, or the game's sounds are muted while its voice still speaks\. While the game speaks, its sounds dip and come back about a second later: that is how iOS mixes speech with other sound\. /g, ''],
  [/tap the screen once and they come back/g, 'press any key and they come back'],
  [/Tap the screen once to bring them back\./g, 'Press any key to bring them back.'],
  // Pause and quitting.
  [/To return to the main menu during a run, pause it with a three-finger tap, then triple tap\./g,
    'To return to the main menu during a run, press Escape.'],
  [/swipe up or down to choose Yes or No, and double tap to choose\./g, 'press Y for yes or N for no, or choose with the up and down arrows and press Enter.'],
  [/Swipe up or down to choose, then double tap\./g, 'Press Y for yes or N for no.'],
  [/except during an elevator ride, where a three-finger tap only gives you the buzz/g, 'except during an elevator ride, where P only gives you the buzz'],
  [/Triple tap to quit, or tap four times for help\./g, 'Press Escape to quit, or H for help.'],
  [/While paused, triple tap to quit the run, or tap four times for help\./g, 'While paused, press Escape to quit the run, or H for help.'],
  // Remaining time in chaos: the keyboard's T is always there on a computer.
  [/and every double tap tells you it, just before your points, or on a keyboard you can press T at any point to check it\./g,
    'and every press of Enter tells you it, just before your points, or you can press T at any point to check it.'],
  // Driving Controls.
  [/Put a finger on the screen and slide it up to accelerate, and keep that finger on the screen for as long as you want to keep accelerating\. This is the only control in the game you hold rather than tap, and letting go is itself an instruction: lift your finger and you coast, bleeding speed gradually\. Swiping down is the brake and takes speed off hard: each swipe down is one touch of the brake, and sliding your accelerating finger back down stops accelerating and brakes once\. Swiping left and right moves you one lane at a time, lifting your finger first,/g,
    'Hold the up arrow to accelerate, for as long as you want to keep accelerating. Outside Ultimate Mode, this is the only key in the game you hold rather than press, and letting go is itself an instruction: release it and you coast, bleeding speed gradually. The down arrow is the brake and takes speed off hard: each press is one touch of the brake. The left and right arrows move you one lane at a time,'],
  [/swiping left or right at a standstill only gives you the boundary buzz/g, 'pressing left or right at a standstill only gives you the boundary buzz'],
  [/Lift your finger, then tap with two fingers to shoot straight down your own lane, or double tap for your status; the car coasts while your finger is off the screen\./g,
    'Press Space to shoot straight down your own lane, or Enter for your status.'],
  // Events help.
  [/Descriptions are written for the computer version too, so if one names a key, the arrow keys are swipes, Enter is a double tap, Space is a tap with two fingers, and T is in your double tap's report\./g,
    'Descriptions are written for the keyboard, so their keys are the keys you press.'],
  [/\bSwipes up and down move\b/g, 'The up and down arrows move'],
  [/Quitting a run by pausing with three fingers, then a triple tap, keeps nothing from it\./g, 'Quitting a run with Escape keeps nothing from it.'],
  [/Swipes move you a step at a time, T on a keyboard tells you the clock,/g, 'The arrow keys move you a step at a time, T tells you the clock,'],
  [/\bwith a two-finger tap\b/g, 'with Space'],
  // Gesture Practice is not offered on a computer; these are only for safety.
  [/New here\? Try Gesture Practice, on this menu\. /g, ''],
  // Ultimate Mode (web 2.0.0): the compass is C on a keyboard.
  [/To turn it on, put one finger on the screen and hold it still for about one second; hold again to turn it off\. This works in Ultimate Mode only: in every other mode a still finger does nothing\./g,
    'To turn it on, press C; press C again to turn it off. This works in Ultimate Mode only.'],
  // Web 4.0.0: the world turns with you. On a computer the left and right arrows
  // turn, a press for a quick turn and a hold to turn freely; the up and down
  // arrows step, and held they run and walk back, which a keyboard does in no
  // other mode; and a run may be turned.
  [/With the compass on you turn exactly as you do with it off: swipe left or right to turn 30 degrees, or slide left or right and hold to turn freely\./g,
    'With the compass on you turn exactly as you do with it off: press the left or right arrow to turn 30 degrees, or hold one down to turn freely.'],
  [/Swipe up to hear any of it again\./g, 'Press the up arrow to hear any of it again.'],
  [/Swipe left or right to turn: one swipe is a quick turn of 30 degrees, so three swipes are a quarter turn, from one main direction to the next, and six turn you right round\./g,
    'Press the left or right arrow to turn: one press is a quick turn of 30 degrees, so three presses are a quarter turn, from one main direction to the next, and six turn you right round.'],
  [/If a held turn has left you between two steps, the next swipe takes you onto a step again\./g,
    'If a held turn has left you between two steps, the next press takes you onto a step again.'],
  [/Slide left or right and hold to turn freely: the turn starts slowly, so a short hold is a small nudge for aiming, then gathers speed to a full circle in about two and a half seconds, and you stop exactly where you lift\./g,
    'Hold the left or right arrow down to turn freely: the turn starts slowly, so a short hold is a small nudge for aiming, then gathers speed to a full circle in about two and a half seconds, and you stop exactly where you let go.'],
  [/A swipe that only pauses for an instant before your finger lifts is still a swipe, so a quick turn never depends on how you swipe\./g,
    'A press held only an instant too long is still a press, so a quick turn never depends on how you press.'],
  [/Swipe up to take one step the way you are facing, and swipe down to take one step straight back\./g,
    'Press the up arrow to take one step the way you are facing, and the down arrow to take one step straight back.'],
  [/Slide up and hold to run, slide down and hold to walk backwards, at the usual speeds, lift to stop\. On a touch screen you cannot turn while you run: lift, turn, then run again\./g,
    'Hold the up arrow down to run and the down arrow to walk backwards, and let go to stop. You can turn while you run: press or hold the left or right arrow as well, and your run curves.'],
  [/Hold a finger still for a second for the compass\./g, 'Press C for the compass.'],
  // The notice said once at the first run after web 4.0.0 (modes/ultimate.js, TURN_NOTICE).
  [/Swipe left or right for a quick turn\./g, 'Press the left or right arrow for a quick turn.'],
  [/Slide left or right and hold to keep turning\./g, 'Hold the left or right arrow down to keep turning.'],
  // (web 4.1.0: the pool.)
  [/If you run through it, by sliding a finger up and holding it, you swim instead/g, 'If you run through it, by holding the up arrow down, you swim instead'],
  [/Swipe up to walk the way you are facing\./g, 'Press the up arrow to walk the way you are facing, or hold it down to run.'],
  [/with no item in hand the tap gives the empty click/g, 'with no item in hand the press gives the empty click'],
  [/hold a finger still, double tap, triple tap/g, 'double tap, triple tap'],
];

const PHRASES = [
  [/\bwhichever way you last swiped\b/g, 'whichever way you last stepped'],
  [/\bwith a swipe up or down\b/g, 'with the up or down arrow'],
  [/\bSwipes left and right turn you\b/g, 'The left and right arrows turn you'],
  [/\bThe wrong swipe\b/g, 'The wrong arrow'],
  [/\bSwipe toward it\b/g, 'Press the arrow toward it'],
  [/\bA swipe down, taking speed off hard\b/g, 'The down arrow, taking speed off hard'],
  [/\bSwipe up, down, left or right to move one step at a time\b/g, 'Use the arrow keys to move one step at a time'],
  [/\bSwipe up and down to navigate\b/g, 'Use the up and down arrows to navigate'],
  [/\bSwipe up and down to choose a section, double tap to open it, triple tap to leave\b/g,
    'Use the up and down arrows to choose a section, Enter to open it, Escape to leave'],
  [/\bSwipe up and down to move along that list, double tap a section to open it, and triple tap to come back out\b/g,
    'Use the up and down arrows to move along that list, press Enter on a section to open it, and Escape to come back out'],
  [/\bswiping up and down moves between its topics\b/g, 'the up and down arrows move between its topics'],
  [/\bswipe up and down to hear them\b/g, 'use the up and down arrows to hear them'],
  [/\bSwipe up and down to hear (scores|them)\b/g, 'Use the up and down arrows to hear $1'],
  [/\bDouble tap or triple tap to go back\b/g, 'Press Enter or Escape to go back'],
  [/\bTriple tap also steps back\b/g, 'Escape also steps back'],
  [/\bTriple tap leaves\b/g, 'Escape leaves'],
  [/\bTriple tap on the section list\b/g, 'Escape on the section list'],
  [/\bTriple tap goes back\b/g, 'Escape goes back'],
  [/\bTap four times for Help\b/g, 'Press H for Help'],
  [/\bTap with three fingers again to resume\b/g, 'Press P again to resume'],
  [/\bTap with three fingers to resume\b/g, 'Press P to resume'],
  [/\bTap with three fingers to pause\b/g, 'Press P to pause'],
  [/\ba three-finger tap pauses\b/g, 'P pauses'],
  [/\bTap with two fingers to throw\b/g, 'Press Space to throw'],
  [/\bTap with two fingers on every beat, just as you hear it\b/g, 'Press Space on every beat, just as you hear it'],
  [/\bA tap off the beat, or a beat with no tap\b/g, 'A press off the beat, or a beat with no press'],
  [/\btap with two fingers to cast\b/g, 'press Space to cast'],
  [/\byou tap with two fingers to send a ping\b/g, 'you press Space to send a ping'],
  [/\bwhen you tap with two fingers\b/g, 'when you press Space'],
  [/\btap with two fingers\b/g, 'press Space'],
  [/\bTap with two fingers\b/g, 'Press Space'],
  [/\bYou shoot with a two-finger tap\b/g, 'You shoot with Space'],
  [/\bA two-finger tap fires\b/g, 'Space fires'],
  [/\bA two-finger tap (throws|plays|sends|puts)\b/g, 'Space $1'],
  [/\bA double tap repeats\b/g, 'Enter repeats'],
  [/\bswipe in the same order\b/g, 'press the arrows in the same order'],
  [/\bA wrong or late swipe\b/g, 'A wrong or late arrow'],
  [/\bwhat a two-finger tap hits\b/g, 'what Space hits'],
  [/\blaser on a two-finger tap\b/g, 'laser on Space'],
  [/\ba two-finger tap is always the attack\b/g, 'Space is always the attack'],
  [/\ba double tap is always the report\b/g, 'Enter is always the report'],
  [/\bA few gestures report\b/g, 'A few keys report'],
  [/\bonly the double tap is counted\b/g, 'only Enter is counted'],
  [/\bthe double tap is how you get\b/g, 'Enter is how you get'],
  [/\bwhatever you ask for with a double tap\b/g, 'whatever you ask for with Enter'],
  [/\ba double tap starts one\b/g, 'Enter starts one'],
  [/\bso a double tap starts the run\b/g, 'so Enter starts the run'],
  [/\bA double tap on an island tells you\b/g, 'Enter on an island tells you'],
  [/\bA double tap tells you\b/g, 'Enter tells you'],
  [/\ba double tap tells you\b/g, 'Enter tells you'],
  [/\bdouble tap on the island\b/g, 'press Enter on the island'],
  [/\bDouble tap at any (time|point)\b/g, 'Press Enter at any $1'],
  [/\bDouble tap for\b/g, 'Press Enter for'],
  [/\bdouble tap for\b/g, 'press Enter for'],
  [/\bDouble tap to\b/g, 'Press Enter to'],
  [/\bDouble tap it\b/g, 'Press Enter on it'],
  [/\bIn island mode, double tap:/g, 'In island mode, press Enter:'],
  [/\bdouble tap to choose\b/g, 'press Enter to choose'],
  [/\bdouble tap\b/g, 'press Enter'],
  [/\bDouble tap\b/g, 'Press Enter'],
  [/\bfour taps\b/g, 'H'],
  [/\bwhich gestures to use\b/g, 'which keys to use'],
  [/\bswiping\b/g, 'pressing the arrows'],
  [/\bby swiping\b/g, 'with the arrow keys'],
];

export function keyWords(text) {
  let t = String(text);
  for (const [re, to] of SENTENCES) t = t.replace(re, to);
  for (const [re, to] of PHRASES) t = t.replace(re, to);
  return t;
}

// Words that would mean a gesture was left unconverted (the tests use this). A
// trapped diver's "three hollow taps" are a sound, not a gesture.
export const LEFTOVER = /\b(swip\w*|double[- ]tap\w*|triple[- ]tap\w*|two-finger|three-finger|four taps|finger\w*|gesture\w*)\b/i;
