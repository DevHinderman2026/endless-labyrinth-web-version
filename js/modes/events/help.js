// The help section "Events" (the desktop's _event_help in event_engine.py), with
// keys turned into gestures and otherwise word for word. On the desktop the item
// sounds' demos are part of this section, at its end; on the web they are their
// own section, "Demos, Events", after the other demos (web 1.3.0, Russell's
// decision), so the game's help and the website's Help page match. Topics that
// explain something and also play its sound (the bell, the mission sounds) stay
// in Events.

import { THEMES } from './schema.js';
import { HELP as MORE_HELP } from './more-spec.js';
import { gestureWords } from './wording.js';

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "Demos, Events": every item sound, then every collected sound.
export function eventDemos() {
  const demos = Object.entries(THEMES).map(([name, desc]) => ({ title: `${title(name)} Item`, desc, sound: `event_beacon_${name}` }));
  demos.push(...Object.keys(THEMES).map((name) => ({ title: `${title(name)} Collected`, desc: `Collecting a ${name}.`, sound: `event_pickup_${name}` })));
  return demos;
}

export function eventHelp() {
  return [
    { title: 'Events', desc: 'Events are special challenges that are only open for a '
      + 'while: anything from half an hour to a few weeks. Choose Events on the main menu '
      + 'to hear what is on right now and how long each one has left. Events that are coming soon are listed too, with how long until they open, and '
      + "one becomes playable the moment it starts. Each event's description tells you what to do and "
      + 'which gestures to use, so a double tap starts the run straight away, with nothing said first. '
      + 'Descriptions are written for the computer version too, so if one names a key, the arrow keys are swipes, '
      + 'Enter is a double tap, Space is a tap with two fingers, and T is in your double tap\'s report. '
      + 'Swipes up and down move through the list and '
      + 'a double tap starts one. Events are checked '
      + 'on the internet when the game starts and when you open the menu, at most every two minutes '
      + '(Check for new events looks at once), so new '
      + 'ones simply appear. Events go by internet time, so until the game has reached the internet '
      + 'there are no events; if the connection drops later, only the built-in events stay. Every event has '
      + 'a mission of its own, from collecting and surviving to memory tunes, dodging and fishing: '
      + 'the help sections that follow describe each one.', sound: null },
    { title: 'Events Walking Into Things', desc: 'In an event you only take or touch something by stepping forward or back onto it, with a swipe up or down. Swipes left and right turn you and take a step, but they never touch anything, even something you step right onto, so you can turn left and right to listen without picking anything up, ringing a bell, touching a false one or walking through a way out. Every step moves you exactly one step, so everything in the room sits in a square one step across. To reach something, turn left or right until it is straight ahead of you or straight behind you, then step forward or back until you land in its square. Being close is never enough: standing right in front of it does nothing until you take that step. This is for everything in an event: items, bells real and false, time credits, checkpoints, pads, keys, doors and both ways out. Only you have to walk in: a creature reaches you from any side. This rule is only for events; the game\'s own modes work as they always have.', sound: null },
    { title: 'Events Event High Scores', desc: 'Event High Scores, on the main menu, '
      + 'keep your best run in every event you have played, even after the event has ended. '
      + 'Swipes up and down move through them: each says the event, your best run, how many runs '
      + 'you have played and the day you set the best. They are kept separately from the '
      + 'other high scores and can never be reset. Quitting a run by pausing with three fingers, then a triple tap, keeps nothing '
      + 'from it.', sound: null },
    { title: 'Events Time', desc: 'Whether an event is open is decided by the time on '
      + "the internet, not your device's clock, so changing the clock does not open or "
      + 'reopen an event. An event can also be stopped early or brought back by its '
      + 'maker, and the game checks again just before a run starts, so you always play the '
      + 'latest version. A run you start before an event closes can always be finished.', sound: null },
    { title: 'Events Collecting', desc: 'In a collecting event you walk a room hunting '
      + 'for items by ear, as many as you can before the clock runs out. Each item calls '
      + 'with its own looping sound: left and right tell you its bearing, loudness tells '
      + 'you how close it is, and it sounds duller when it is behind you, south of you. '
      + 'Walk onto it to collect it, and the next one appears somewhere else. Swipes '
      + 'move you a step at a time, T on a keyboard tells you the clock, a double tap tells you how many you have, '
      + 'your points and the clock, and a three-finger tap pauses. Some events also have time credits, '
      + 'laid out like battle mode\'s: higher and faster spinning is worth more. Events '
      + 'can be held in rooms of any size, from a small hall to a huge cathedral, and the '
      + 'echo matches the room: a cathedral rings for a long time after every step.', sound: null },
    { title: 'Events Surviving', desc: 'In a survival event creatures are loose in the room and '
      + 'the point is to stay alive until the clock runs out. Every second you last is worth points. '
      + 'Each creature has its own sound, louder as it comes closer, duller when it is behind you. Some '
      + 'roam, some hunt you, and some guard their corner and charge if you come near. What happens when '
      + 'one reaches you depends on the event: it can end the run, or cost you time or points and be '
      + 'thrown back. Some events let you fire at them with a two-finger tap, aimed like battle mode: whatever is '
      + 'centred between your ears. A double tap tells you how many are about.', sound: null },
    { title: 'Events Races', desc: 'Some events hide a fixed number of items, and the run ends the '
      + 'moment you find the last one. In those, finishing fast can be worth a time bonus for every second '
      + 'left on the clock, and a double tap tells you how many are left to find. Some keep the number a secret, and '
      + 'some pick a different number of items every run, so you never know when the last one is coming.', sound: null },
    { title: 'Events The Air', desc: 'Some events place several backgrounds around the '
      + 'room, such as an organ in one corner, a choir in another and a haunted house in a third. '
      + 'Each is loudest in its own part of the room and leans toward its side, so the air changes '
      + 'as you walk, and with practice tells you roughly where you are.', sound: null },
    { title: 'Events Real and False', desc: 'In some events the room is full of things '
      + 'that call out, but only some of them are real. The false ones sound wrong: a warped, '
      + 'wobbling, distorted version of the real sound, just as loud, so only your ears can tell '
      + 'them apart. Walk into a real one to collect it. Walk into a false one and the run is over '
      + 'at once. Some events ask you to ring a real one several times: after each ring it falls '
      + 'quiet, then rings from a new place with a new note, and the false ones take up that note '
      + 'too, so only their warped sound gives them away. In Call of Fate you ring the real bell '
      + 'once on level 1, and on each level after, as many times as the level before or up to two more, '
      + 'at random. '
      + 'Find every real one on a level and the way out opens, and the false ones keep '
      + 'calling all the while. Nothing is said when it opens: listen for it. Walk to the way out '
      + 'and the next level begins, with more to find and more false ones among them. On some '
      + 'levels two ways open, and nothing tells you so: only one is the true way out, and '
      + 'walking through the other ends the run. The false one opens right in front of the true one, '
      + 'between it and you, so walking straight at the true way out walks into the false one: hear '
      + 'the two apart, step round the false one and walk into the true one. In Call of '
      + 'Fate the exit of the light is a heavenly choir with a shimmering bell over it, and the '
      + 'exit of the dead is a dark choir. A double tap tells you the level, how many you have found and whether the way out '
      + 'is open. Some of these events have no clock at all: T on a keyboard says so, and the run lasts until '
      + 'you touch a false one.', sound: null },
    { title: 'Events Carry and Deliver', desc: 'In a delivery event you pick up an item by walking '
      + 'onto it, then carry it to the drop-off, which calls with its own sound while you are carrying '
      + 'something. Some events let you carry more than one at a time; while your hands are full, the items '
      + "waiting in the room fall silent. In some events a creature's touch knocks everything out of your "
      + 'hands, and it goes back into the room. A double tap tells you how many you have delivered and are '
      + 'carrying.', sound: null },
    { title: 'Events Catch the Runaways', desc: 'In a catching event the items run away from you '
      + 'once you come close, and wander about when you are far off. They cannot run through walls, so '
      + 'the way to catch one is to drive it into a corner or against a wall and step onto it.', sound: null },
    { title: 'Events Checkpoints', desc: 'In a checkpoint event one checkpoint calls at a time. '
      + 'Reach it before its own countdown runs out, and the next one calls from somewhere new, usually '
      + 'with a little less time. The last three seconds of each countdown beep. Miss one and the run is '
      + 'over. A double tap tells you how many you have reached and the seconds left for this one.', sound: 'event_checkpoint' },
    { title: 'Events Follow the Guide', desc: 'In a follow event a sound walks slowly around the '
      + 'room, sometimes stopping for a moment. Stay close to it: every second you are with it is worth '
      + 'points. When it gets too far away a soft tick sounds once a second, and if you stay too far behind '
      + 'for too long, the guide is lost and the run is over. The guide walks a little faster as the run '
      + 'goes on, so even a run with no clock ends in the end: the longer you keep up, the higher your '
      + 'score.', sound: 'event_lost_tick' },
    { title: 'Events Hunt', desc: 'In a hunt you bring down every creature in the room with the '
      + 'laser on a two-finger tap, aimed like battle mode: whatever is centred between your ears. Some hunts lay out '
      + 'ammo boxes now and then, which you collect by walking onto them. Bring them all down and the hunt '
      + 'is won. A double tap tells you how many are left and how many shots you have. From version 5.0.0, an event can '
      + 'give you unlimited shots: then the laser never runs out, you hear unlimited shots in place of a number, no ammo '
      + 'boxes appear, and a reward that would have been shots is points instead.', sound: null },
    { title: 'Events Silent Search', desc: 'In a silent search the items make no sound at all until '
      + 'you tap with two fingers to send a ping. Then each one answers once, from where it is hiding: nearer ones '
      + 'answer first. Remember where you heard them and walk there. Some events limit how many pings you '
      + 'have, and pings need a moment to recharge; some ping by themselves now and then.', sound: 'event_ping' },
    { title: 'Events In Order', desc: 'In an in-order event several items call at once, each on its '
      + 'own note. Collect them from the lowest note to the highest, or in some events from the highest to '
      + 'the lowest. Taking the wrong one sounds a buzz and, depending on the event, ends the run or costs '
      + 'you points or seconds. Clear a round and the next one has more notes.', sound: 'event_wrong' },
    { title: 'Events Escape', desc: 'In an escape event each room has a way out somewhere, and '
      + 'creatures hunting you. Walk through the way out and the next room begins, with the way out '
      + 'somewhere new and more creatures. For a moment as each room begins, nothing can reach you.', sound: null },
    { title: 'Events Memory', desc: 'In a memory event pads stand in a ring round the middle of '
      + 'the room, the first straight ahead of you, each on its own note. The game plays a tune on them, each '
      + 'note coming from its pad. Then walk to the pads in the same order: each one plays its note as you '
      + 'step on it. Get it right and the next tune is one note longer. In some events the pads hum their '
      + 'notes softly while it is your turn, so you can find them.', sound: null },
    { title: 'Events Find the Pairs', desc: 'In a pairs event pads knock softly all round the room. '
      + 'Each hides a sound, and every sound is on two pads. Step on a pad to hear its sound, then find the '
      + 'other pad that sounds the same: step on it next and the pair is yours. Step on a different one and '
      + 'that one becomes the first of your next try. Clear every pair and a new round begins, with more.', sound: 'event_pad' },
    { title: 'Events Treasure Detector', desc: 'In a detector event the treasure is buried and makes no '
      + 'sound. Your detector beeps slowly when you are far away and faster and faster as you get closer. '
      + 'In some events the beep also leans toward the treasure. Walk onto it to dig it up, and the next one '
      + 'is buried somewhere else.', sound: 'event_detector_beep' },
    { title: 'Events Dodge', desc: 'In a dodge event things fall from the sky near you, each with a '
      + 'falling whistle from where it will land. Get away from that spot before it lands: each one you '
      + 'dodge is worth points, and each one that hits you costs a life. They come faster as the run goes '
      + 'on.', sound: 'event_falling' },
    { title: 'Events Defend the Treasure', desc: 'In a defend event the treasure sits in the middle of '
      + 'the room, calling, and creatures come from the walls to take it. Shoot them with a two-finger tap before they '
      + "reach it. Each one that reaches it takes one of the treasure's lives. Every time one comes back from "
      + 'a wall, whether you brought it down or it reached the treasure, they all get a little faster. They only want the treasure: one passing you never hurts '
      + 'you.', sound: null },
    { title: 'Events Hold the Spot', desc: 'In a hold event a spot in the room calls. Stand in it: '
      + 'every second inside is worth points. Every so often it moves somewhere else, and in some events a '
      + 'chime warns you three seconds before.', sound: null },
    { title: 'Events Sneak', desc: 'In a sneak event a guard sleeps somewhere in the room, snoring, and you collect items around it. Every step you take near it makes noise, more the nearer you are; the noise dies away as you keep still or move off. Make too much and it wakes and hunts you for a while, then falls asleep again where it stands. Walking right into a sleeping guard does not hurt you, but it wakes at once and hunts you. A double tap tells you if it is asleep, stirring or awake.', sound: null },
    { title: 'Events Defuse', desc: 'In a defuse event a bomb ticks somewhere in the room. Walk onto it to pick it up, then carry it to the safe spot, which calls while you hold it. The last three seconds of a fuse beep. Each bomb\'s fuse is a little shorter, and each one that goes off costs a life. A double tap tells you the seconds left on the fuse.', sound: null },
    { title: 'Events Rescue', desc: 'In a rescue event friends call for help around the room. Walk onto one and it follows you; lead it home, which calls while someone follows you. Walk too far ahead and a friend is left behind, and calls for help again where it stopped.', sound: null },
    { title: 'Events Reflex', desc: 'In a reflex event you stand still, and a short sound comes from ahead, behind, left or right. Swipe toward it as fast as you can: the quicker, the more points. The wrong swipe, or none in time, costs a life, and each sound gives a little less time than the one before.', sound: null },
    { title: 'Events Musical Chairs', desc: 'In a musical chairs event music plays while you walk about. When it stops, chairs knock somewhere in the room: reach one before the time runs out. Each round has a little less time and one chair fewer.', sound: null },
    { title: 'Events Fishing', desc: 'In a fishing event fish swim about the pond, each with its own sound. When one is right in front of you, centred between your ears and near enough, tap with two fingers to cast and catch it. The line only goes out in front: a fish behind you is never caught. A cast into empty water is just a plop, and you must wait a moment before the next.', sound: null },
    { title: 'Events Step Limit', desc: 'In a step limit event you have only so many steps, and every item you collect gives you more. Once you are nearly out, every step ticks. Run out and the run is over, so plan your path. A double tap tells you the steps left.', sound: null },
    { title: 'Events Key and Door', desc: 'In a key and door event each room has a key somewhere, calling. Find it and the locked door opens, calling from somewhere else: walk through it for the next room.', sound: null },
    { title: 'Events Whack-a-Mole', desc: 'In a whack-a-mole event things pop up near you, each for a moment only. Reach each one before it hides again; they stay up for less time as the run goes on. In some events, too many getting away ends the run.', sound: null },
    { title: 'Events Herding', desc: 'In a herding event animals run away from you, and the pen calls from its place in the room. Walk behind an animal to drive it the way you want it to go, into the pen.', sound: null },
    { title: 'Events Rhythm', desc: 'In a rhythm event a drum beats steadily. Tap with two fingers on every beat, just as you hear it; it speeds up as you go. A tap off the beat, or a beat with no tap, is a miss, and too many misses end the run.', sound: null },
    { title: 'Events Sorting', desc: 'In a sorting event items of different kinds lie about, each kind with its own sound. Pick one up, and every bin, one for each kind in a corner of its own, calls with its own kind\'s sound: carry the item to the bin that sounds the same as it.', sound: null },
    { title: 'Events Lamplighter', desc: 'In a lamplighter event lamps stand round the room, humming while they burn. As a lamp runs low its hum fades; walk to it to light it again before it goes out. Each lighting burns a little shorter, and too many out ends the run.', sound: null },
    { title: 'Events Glass Cases', desc: 'From version 5.0.0, some events lock items in glass display cases. A case hums where it stands. Within fifteen steps it also knocks, faster and louder the closer you are, so you can tell which way it is. When you are beside it a bell rings: now tap with two fingers to smash it. Walking onto a case does nothing. A smash always sounds like glass. Whatever was in the case is yours at once, with nothing to pick up, and if the case held an extra reward the voice says only that: seconds, shots, points or a life. Broken glass is left on the floor round where the case stood. In some events the noise of a smash wakes creatures that listen, or brings chasers running from far off, silent at first.', sound: 'event_case_knock' },
    { title: 'Events Creatures That Listen', desc: 'From version 5.0.0, some creatures do not hunt you: they wait, breathing, and listen. Each one faces one way, and you can hear which: it is clearer from in front of it and quieter from beside or behind. Come within a few steps in front of one and it notices you. Beside it and behind it are safe, so go round. Loud sounds wake it from farther off: a step on broken glass, a case being smashed, and in some events the laser. A woken creature growls first, which is your warning, then charges for a while, and if you have got far enough away it stops where it is and rests again. Walking into one that is resting only wakes it.', sound: null },
    { title: 'Events Runners, Statues and Throwers', desc: 'From version 5.0.0, an event can have up to three kinds of creature at once, each with its own sound. A runner keeps away from you: corner it against a wall or the edge of the room and walk into it to catch it, for points. A statue comes for you only while you are moving, and freezes the moment you stand still. A thrower keeps its distance and throws at you: you hear it wind up, and the throw is aimed at the square you are standing in at that moment, so step out of that square before it lands and it misses.', sound: null },
    { title: 'Events Floors', desc: 'From version 5.0.0, an event has a floor you can hear in your footsteps: stone, sand, snow, water, broken glass, ice or mud, sometimes with patches of a second floor. Some floors do something. Glass is loud: creatures that listen hear every step on it. In water your steps are quiet, and a listening creature notices you from only half as far. Ice slides you one more step the same way, unless a wall or the edge of the room stops you. Mud holds you for a moment after each step.', sound: null },
    { title: 'Events Walls', desc: 'From version 5.0.0, an event room can be a labyrinth of walls, new on every level. Walking into a wall gives the wall knock, as in standard mode, and you stay where you are. There is always a way through to everything. Creatures do not pass through walls: they find their way round, as you do.', sound: null },
    { title: 'Events Levels and Stages', desc: 'From version 5.0.0, some events are played in levels: find everything on a level and the next begins, in a new layout, and the voice says its number. Some events end after a set number of levels, some after a number chosen afresh each run with no warning before the last, and some go on until you are caught or out of time. An event can also be made of up to five stages played in a row, each a different mission. Your points carry from stage to stage into one score; each stage has its own clock, lives and shots. Finish a stage and the voice says the number of the next. A double tap tells you the level and the stage.', sound: null },
    { title: 'Events The Meter', desc: 'From version 5.0.0, an event can have a meter that runs down the whole time, such as air, warmth or a torch. The event\'s description says what refills it: collecting items, refills lying about the room, or standing in a safe spot. A warning sounds when it is low, faster as it empties, and when it is empty the run is over. A double tap tells you how much is left.', sound: null },
    { title: 'Events Things in the Room', desc: 'From version 5.0.0, an event room can hold four more kinds of thing. A trap gives a faint warning sound from close by; stepping onto it, with any step, costs time, points or a life, and it is set again somewhere else. A safe spot hums: while you stand in it no creature can touch you. Teleports come in pairs with the same sound: step onto one, with any step, and you are carried to the other. A treasure chest calls with its own sound: step forward or back onto it to open it, and the voice says only what was inside. Supplies can appear too, and are taken by walking onto them: ammo boxes, an extra life, and bonus points.', sound: null },
    { title: 'Events Memories', desc: 'In a memories event, memories lie about each level, each with a sound of its own. Walk onto one to take it, and it plays a few notes of music that belong to it alone. Find every memory on a level to reach the next. Such events often have creatures that listen, broken glass underfoot and memories locked in glass cases: see those sections.', sound: null },
    { title: 'Events Smash and Grab', desc: 'In a smash and grab event every item is in a glass case. Find a case by its knocking, get beside it until its bell rings, and tap with two fingers to smash it for its points. See Glass Cases.', sound: null },
    { title: 'Events Silent Escape', desc: 'In a silent escape each room has a way out and creatures that listen. Reach the way out without waking them, going round behind them and keeping off broken glass when one is near. Each room has more of them. The voice says the number of each new room.', sound: null },
    { title: 'Events Echo Hunt', desc: 'In an echo hunt the things you are looking for make no steady sound. Every few seconds each one plays a few notes of music from where it hides, then is silent again. Walk toward the notes and onto the thing to collect it.', sound: null },
    { title: 'Events Lure', desc: 'In a lure event creatures that listen wait near the items, and you draw them away with stones. A stone knocks softly on the floor: walk onto it to pick it up. A two-finger tap throws one. It flies a few steps the way you last stepped, forward, back, left or right, and stops short at a wall. Where it lands, creatures within hearing wake and go to the noise, not to you. A double tap tells you how many stones you hold.', sound: null },
    { title: 'Events Rebuild the Song', desc: 'In a rebuild the song event a tune has been cut into pieces, and each piece plays its own part every few seconds. Find every piece and the whole melody plays, for points. Then another tune is cut up.', sound: null },
    { title: 'Events Storm Chase', desc: 'In a storm chase a shelter calls, and a storm is coming. The thunder tells you how long you have: it comes nearer, louder and more often as your time runs out. Reach the shelter and the next one calls from somewhere new, with a little less time. The voice says the number of each new shelter, and a double tap tells you the seconds before the storm.', sound: null },
    { title: 'Events From a Newer Version', desc: 'Endless Labyrinth keeps growing, and one day an event may use something the version of the game open on your device does not have yet. Such an event is still listed in the Events menu, and says it needs a newer version of the game. Close the game and open it again to update, and the event can be played.', sound: null },
    // web 5.0.0: the 25 further missions, each from its own description (more-spec.js),
    // with the keys it names turned into gestures.
    ...MORE_HELP.map((e) => ({ title: e.title, desc: gestureWords(e.desc, false), sound: e.sound })),
    { title: 'Events No Clock', desc: 'Some events have no time limit at all. T on a keyboard says there is no '
      + 'clock, and the run lasts until the mission ends it: the last item found, a creature\'s touch, a '
      + 'missed checkpoint or a lost guide. At the end you hear how long the run lasted.', sound: null },
    { title: 'Events The Bell', desc: 'A deep bell tolls when an event run begins, and '
      + 'tolls twice, falling, when it ends.', sound: 'event_toll' },
  ];
}
