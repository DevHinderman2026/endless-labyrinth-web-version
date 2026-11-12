// Written by Developer Tools/Web Packs/write_more_spec.py from the desktop game's
// event_more_spec.py. Do not edit by hand: change the desktop's table and write it again.
//
// The 25 further missions of web 5.0.0 (Windows 3.0.0), as one table: each mission's
// label, description, round word, and settings as [key, default, kind, a, b, description].

export const MORE = {
 "redlight": {
  "label": "Red light, green light (3.0.0): move only while the music plays",
  "about": "Red light, green light: a goal calls some steps away. Walk only while the music plays. When it stops, any step costs a life or ends the run. Each goal reached is worth points, and the next round's music is shorter.",
  "word": "Round",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "reached every goal",
  "fields": [
   [
    "goal_distance",
    36,
    "steps",
    9,
    150,
    "how far from the player each goal appears"
   ],
   [
    "green_least",
    2.0,
    "float",
    0.5,
    30.0,
    "the shortest the music plays, in seconds"
   ],
   [
    "green_most",
    5.0,
    "float",
    0.5,
    60.0,
    "the longest the music plays, in seconds"
   ],
   [
    "red_least",
    1.5,
    "float",
    0.5,
    30.0,
    "the shortest silence, in seconds"
   ],
   [
    "red_most",
    4.0,
    "float",
    0.5,
    60.0,
    "the longest silence, in seconds"
   ],
   [
    "shorter_each",
    0.2,
    "float",
    0.0,
    5.0,
    "each round the music's longest time is this many seconds shorter"
   ],
   [
    "on_move",
    "lose_life",
    "choice",
    {
     "lose_life": "You lose a life.",
     "end_run": "The run ends at once."
    },
    null,
    "what a step during the silence does"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives, when a step during the silence costs one"
   ],
   [
    "points_per_goal",
    10,
    "int",
    0,
    100000,
    "points for each goal reached"
   ],
   [
    "music",
    "",
    "sound",
    "ambience",
    "A tune made by the game",
    "the music you walk to"
   ],
   [
    "goal_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the goal's calling sound"
   ]
  ]
 },
 "mines": {
  "label": "Minefield (3.0.0): clicks count the mines beside you",
  "about": "Minefield: cross from the south edge of the room to the goal at the north edge. After every step you hear one click for each mine in the eight squares round you. There is always a safe way through. Each crossing is worth points, and the next field has more mines.",
  "word": "Field",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "crossed every field",
  "fields": [
   [
    "mines_share",
    0.15,
    "float",
    0.03,
    0.4,
    "how much of the first field is mined, from 0.03 to 0.4"
   ],
   [
    "more_each",
    0.03,
    "float",
    0.0,
    0.2,
    "each field after has this much more"
   ],
   [
    "share_most",
    0.35,
    "float",
    0.03,
    0.45,
    "the largest share of a field that is ever mined, however long the run"
   ],
   [
    "on_mine",
    "lose_life",
    "choice",
    {
     "lose_life": "You lose a life.",
     "end_run": "The run ends at once."
    },
    null,
    "what stepping on a mine does"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives, when a mine costs one"
   ],
   [
    "points_per_crossing",
    20,
    "int",
    0,
    100000,
    "points for each field crossed"
   ],
   [
    "goal_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the goal's calling sound"
   ]
  ]
 },
 "stones": {
  "label": "Stepping stones (3.0.0): hear a path, then walk it from memory",
  "about": "Stepping stones: a path of stones crosses the water. The game plays the path once, each stone's note from where it lies. Then walk it from memory: every step must land on the next stone, ahead, left or right. Space plays the path again, a few times. Each crossing is worth points and the next path is longer.",
  "word": "Crossing",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "made every crossing",
  "fields": [
   [
    "first_length",
    5,
    "int",
    2,
    20,
    "stones in the first path"
   ],
   [
    "longer_each",
    1,
    "int",
    0,
    5,
    "each path after has this many more"
   ],
   [
    "longest",
    14,
    "int",
    2,
    30,
    "the most stones a path ever has"
   ],
   [
    "on_wrong",
    "lose_life",
    "choice",
    {
     "lose_life": "You lose a life and start the path again.",
     "end_run": "The run ends at once."
    },
    null,
    "what a step off the path does"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives, when a wrong step costs one"
   ],
   [
    "points_per_crossing",
    15,
    "int",
    0,
    100000,
    "points for each crossing"
   ],
   [
    "replays",
    2,
    "int",
    0,
    20,
    "how many times Space plays the path again, in each crossing"
   ],
   [
    "note_seconds",
    0.6,
    "float",
    0.25,
    2.0,
    "seconds between the notes when the path is played"
   ]
  ]
 },
 "pong": {
  "label": "Bat and ball (3.0.0): get into the ball's line and hit it back",
  "about": "Bat and ball: a ball comes down the room toward you, bouncing off the side walls, and you hear where it is. Be in its line when it reaches your row to hit it back. Every hit is worth points and the ball gets faster. A miss costs a life.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "made every hit",
  "fields": [
   [
    "ball_speed",
    9.0,
    "float",
    3.0,
    40.0,
    "the ball's speed at the start (3 is one step a second)"
   ],
   [
    "faster_each",
    0.06,
    "float",
    0.0,
    0.5,
    "how much faster after each hit, as a share of its speed"
   ],
   [
    "top_speed",
    24.0,
    "float",
    3.0,
    60.0,
    "the ball's top speed (3 is one step a second)"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives: a miss costs one"
   ],
   [
    "points_per_hit",
    5,
    "int",
    0,
    100000,
    "points for each hit"
   ],
   [
    "ball_sound",
    "",
    "sound",
    "item",
    "A bouncing ball (evt_ball_bounce), else a tick made by the game",
    "the ball's sound"
   ]
  ]
 },
 "rival": {
  "label": "Race a rival (3.0.0): a rival hunts the same items as you",
  "about": "Race a rival: the items are the usual ones, but a rival you can hear walks to the nearest and takes it. The run ends on the clock or when the set number of items is gone. Finish with more than the rival for a bonus.",
  "word": null,
  "counts": false,
  "items": true,
  "walls": true,
  "finished": "",
  "fields": [
   [
    "rival_speed",
    2.2,
    "float",
    0.5,
    12.0,
    "the rival's speed (3 is one step a second)"
   ],
   [
    "faster_each",
    0.03,
    "float",
    0.0,
    0.5,
    "how much faster it gets with each item it takes, as a share"
   ],
   [
    "win_bonus",
    25,
    "int",
    0,
    100000,
    "bonus points for finishing with more than the rival"
   ],
   [
    "rival_name",
    "rival",
    "text",
    30,
    null,
    "what the rival is called in the report and the results"
   ],
   [
    "rival_sound",
    "",
    "sound",
    "creature",
    "The guardian's hum, made by the game",
    "the rival's sound"
   ]
  ]
 },
 "thief": {
  "label": "Catch the thief (3.0.0): catch it before it gets out with a treasure",
  "about": "Catch the thief: treasures sit about the room. A thief comes in from an edge, takes the nearest and runs for an edge. Walk into the thief to catch it: points, and the treasure goes back. If it gets out, that treasure is gone. The run ends when every treasure is gone.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "caught the thief every time",
  "fields": [
   [
    "treasures",
    5,
    "int",
    1,
    12,
    "treasures in the room"
   ],
   [
    "thief_speed",
    3.0,
    "float",
    0.5,
    12.0,
    "the thief's speed (3 is one step a second)"
   ],
   [
    "faster_each",
    0.05,
    "float",
    0.0,
    0.5,
    "how much faster after each time it is caught, as a share"
   ],
   [
    "thief_rest",
    3.0,
    "float",
    0.0,
    60.0,
    "seconds before the thief comes back"
   ],
   [
    "points_per_catch",
    10,
    "int",
    0,
    100000,
    "points for each catch"
   ],
   [
    "thief_sound",
    "",
    "sound",
    "creature",
    "An enemy's sound, made by the game",
    "the thief's sound"
   ],
   [
    "treasure_sound",
    "",
    "sound",
    "item",
    "The event's item sound",
    "a treasure's sound"
   ]
  ]
 },
 "boss": {
  "label": "Boss (3.0.0): one great creature; shoot it while it is tired",
  "about": "Boss: one great creature stalks you, roars, then charges in a straight line at where you stood. Step aside. After a charge it is tired and pants for a few seconds: only then do your shots, with Space, hurt it. Its touch costs a life. Bring it down for points, and a stronger one comes.",
  "word": "Boss",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "brought down every boss",
  "fields": [
   [
    "health",
    10,
    "int",
    1,
    200,
    "hits to bring the first boss down"
   ],
   [
    "stronger_each",
    4,
    "int",
    0,
    100,
    "each boss after needs this many more"
   ],
   [
    "speed",
    2.0,
    "float",
    0.5,
    12.0,
    "its speed while it stalks you (3 is one step a second)"
   ],
   [
    "charge_speed",
    12.0,
    "float",
    3.0,
    40.0,
    "the boss's speed in a charge (3 is one step a second)"
   ],
   [
    "stalk_seconds",
    6.0,
    "float",
    1.0,
    60.0,
    "seconds it stalks before each roar"
   ],
   [
    "tired_seconds",
    4.0,
    "float",
    0.5,
    30.0,
    "seconds it is tired after a charge"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "the player's lives: the boss's touch costs one"
   ],
   [
    "points_per_hit",
    2,
    "int",
    0,
    100000,
    "points for each hit that hurts it"
   ],
   [
    "points_for_boss",
    50,
    "int",
    0,
    100000,
    "points for bringing one down"
   ],
   [
    "boss_sound",
    "",
    "sound",
    "creature",
    "The guardian's hum, made by the game",
    "the boss's sound"
   ],
   [
    "roar_sound",
    "",
    "sound",
    "sting",
    "A dragon's roar (evt_dragon_roar), else the falling whistle",
    "its roar before a charge"
   ]
  ]
 },
 "escort": {
  "label": "Escort (3.0.0): lead a friend home and shoot what comes for it",
  "about": "Escort: a friend walks across the room to its home, but only while you stay near it. Raiders come from the walls for the friend: shoot them with Space. Each one that reaches the friend costs the friend a life. Every trip home is worth points, and later trips bring more raiders.",
  "word": "Trip",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "brought the friend home every time",
  "fields": [
   [
    "friend_speed",
    1.5,
    "float",
    0.5,
    6.0,
    "the friend's speed (3 is one step a second)"
   ],
   [
    "stay_within",
    15,
    "steps",
    6,
    60,
    "the friend walks only while you are within this distance"
   ],
   [
    "raiders",
    2,
    "int",
    1,
    6,
    "raiders at a time, on the first trip"
   ],
   [
    "more_every",
    2,
    "int",
    0,
    20,
    "one more raider after every so many trips (0: never more)"
   ],
   [
    "raider_speed",
    3.0,
    "float",
    0.5,
    12.0,
    "a raider's speed (3 is one step a second)"
   ],
   [
    "friend_lives",
    3,
    "int",
    1,
    20,
    "how many lives the friend has"
   ],
   [
    "points_per_trip",
    25,
    "int",
    0,
    100000,
    "points for each trip home"
   ],
   [
    "points_per_raider",
    2,
    "int",
    0,
    100000,
    "points for each raider shot"
   ],
   [
    "friend_sound",
    "",
    "sound",
    "item",
    "The event's item sound",
    "the friend's sound"
   ],
   [
    "raider_sound",
    "",
    "sound",
    "creature",
    "An enemy's sound, made by the game",
    "a raider's sound"
   ],
   [
    "home_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the home's calling sound"
   ]
  ]
 },
 "gallery": {
  "label": "Shooting gallery (3.0.0): hit the targets, spare the friends",
  "about": "Shooting gallery: targets pop up ahead of you, one at a time, each for a few seconds. Step left or right until one is centred between your ears, and shoot with Space. Some are friends, with a different sound: shooting one costs points. A target that gets away is a miss, and too many misses end the run.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "hit every target",
  "fields": [
   [
    "up_seconds",
    4.0,
    "float",
    0.5,
    30.0,
    "seconds the first target stays up"
   ],
   [
    "shorter_each",
    0.05,
    "float",
    0.0,
    1.0,
    "each one after stays up this many seconds less"
   ],
   [
    "shortest",
    1.2,
    "float",
    0.3,
    30.0,
    "the shortest time a target ever stays up, in seconds"
   ],
   [
    "friend_share",
    0.25,
    "float",
    0.0,
    0.8,
    "how many are friends, from 0 to 0.8"
   ],
   [
    "points_per_target",
    5,
    "int",
    0,
    100000,
    "points for each target hit"
   ],
   [
    "friend_penalty",
    10,
    "int",
    0,
    100000,
    "points lost for shooting a friend"
   ],
   [
    "misses_allowed",
    5,
    "int",
    0,
    100,
    "misses before the run ends (0: misses never end it)"
   ],
   [
    "width",
    4,
    "int",
    1,
    10,
    "targets appear up to this many steps left or right of the middle"
   ],
   [
    "distance",
    15,
    "steps",
    6,
    60,
    "how far ahead the targets stand"
   ],
   [
    "target_sound",
    "",
    "sound",
    "creature",
    "An enemy's sound, made by the game",
    "a target's sound"
   ],
   [
    "friend_sound",
    "",
    "sound",
    "item",
    "The event's item sound",
    "a friend's sound"
   ]
  ]
 },
 "odd": {
  "label": "Odd one out (3.0.0): walk to the one that sounds different",
  "about": "Odd one out: several things sound the same note, one after another, but one of them is a little higher or lower. Step onto the odd one. Each round has more things and a smaller difference.",
  "word": "Round",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "found every odd one",
  "fields": [
   [
    "things_first",
    3,
    "int",
    3,
    8,
    "things in the first round"
   ],
   [
    "things_most",
    7,
    "int",
    3,
    8,
    "the most things in a round"
   ],
   [
    "difference_first",
    4.0,
    "float",
    0.5,
    12.0,
    "how different the odd one is in the first round, in semitones"
   ],
   [
    "closer_each",
    0.5,
    "float",
    0.0,
    4.0,
    "each round it is this many semitones closer"
   ],
   [
    "difference_least",
    0.5,
    "float",
    0.25,
    12.0,
    "the smallest difference the odd one ever has, in semitones"
   ],
   [
    "on_wrong",
    "lose_life",
    "choice",
    {
     "lose_life": "You lose a life.",
     "end_run": "The run ends at once."
    },
    null,
    "what stepping onto the wrong one does"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives, when a wrong one costs one"
   ],
   [
    "points_per_round",
    10,
    "int",
    0,
    100000,
    "points for each odd one found"
   ]
  ]
 },
 "cover": {
  "label": "Cover the ground (3.0.0): every new square you step on scores",
  "about": "Cover the ground: every square you step on for the first time scores and chimes; a square you have already walked on does not. A run of new squares in a row earns a bonus. It can end when a set number are covered.",
  "word": null,
  "counts": false,
  "items": false,
  "walls": true,
  "finished": "",
  "fields": [
   [
    "points_per_square",
    1,
    "int",
    0,
    1000,
    "points for each new square"
   ],
   [
    "streak",
    10,
    "int",
    0,
    500,
    "new squares in a row that earn a bonus (0: no bonus)"
   ],
   [
    "streak_bonus",
    5,
    "int",
    0,
    100000,
    "the bonus, in points"
   ],
   [
    "squares_to_cover",
    0,
    "int",
    0,
    1500,
    "the run ends when this many are covered (0: it does not end this way)"
   ],
   [
    "new_sound",
    "",
    "sound",
    "pickup",
    "A soft beep, made by the game",
    "the sound of a new square"
   ]
  ]
 },
 "sonar": {
  "label": "Sonar maze (3.0.0): silent walls you hear by pinging",
  "about": "Sonar maze: a labyrinth of walls with a silent way out. Space sends a ping: the walls near you answer with ticks from where they stand, the nearest first, and the way out answers with a chime from wherever it is. Reach the way out for points and a new maze. The Walls block must be turned on.",
  "word": "Maze",
  "counts": true,
  "items": false,
  "walls": true,
  "finished": "escaped every maze",
  "fields": [
   [
    "ping_seconds",
    1.5,
    "float",
    0.3,
    30.0,
    "seconds before the next ping is ready"
   ],
   [
    "pings",
    0,
    "int",
    0,
    1000,
    "pings in each maze (0: as many as you like)"
   ],
   [
    "ping_range",
    4,
    "int",
    1,
    12,
    "walls answer from up to this many steps away"
   ],
   [
    "exit_distance",
    24,
    "steps",
    9,
    150,
    "how far from the player the way out is, at least"
   ],
   [
    "points_per_maze",
    20,
    "int",
    0,
    100000,
    "points for each maze"
   ],
   [
    "exit_sound",
    "",
    "sound",
    "exit",
    "A bright chime, made by the game",
    "the way out's answer to a ping"
   ]
  ]
 },
 "courier": {
  "label": "Courier (3.0.0): fetch what each customer calls for",
  "about": "Courier: a customer calls. Step onto them to hear their order, a sound, once. Shelves stand in a row, each with its own sound: step onto the one that matches, then bring it back to the customer. Right is worth points; wrong loses some. Customers lose patience, and too many lost end the run.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "served every customer",
  "fields": [
   [
    "shelves",
    4,
    "int",
    2,
    6,
    "how many shelves stand in the row"
   ],
   [
    "patience_seconds",
    45,
    "int",
    0,
    600,
    "seconds the first customer waits (0: customers wait for ever)"
   ],
   [
    "shorter_each",
    2,
    "int",
    0,
    60,
    "each customer after waits this many seconds less"
   ],
   [
    "patience_least",
    15,
    "int",
    5,
    600,
    "the shortest time a customer ever waits, in seconds"
   ],
   [
    "points_per_order",
    10,
    "int",
    0,
    100000,
    "points for each order"
   ],
   [
    "wrong_cost",
    5,
    "int",
    0,
    100000,
    "points lost for bringing the wrong thing"
   ],
   [
    "misses_allowed",
    3,
    "int",
    0,
    100,
    "customers lost before the run ends (0: never)"
   ],
   [
    "shelf_sounds",
    [],
    "sounds",
    "item",
    null,
    "the shelves' sounds, one for each shelf (empty: notes made by the game)"
   ],
   [
    "customer_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "a customer's calling sound"
   ]
  ]
 },
 "dance": {
  "label": "Dance steps (3.0.0): repeat the caller's steps with the arrows",
  "about": "Dance steps: you stand still. A caller plays a row of steps, each a note from ahead, behind, left or right. Then press the arrows in the same order. Right is worth points and the next row is longer. A wrong or late arrow costs a life and the row plays again.",
  "word": "Round",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "danced every round",
  "fields": [
   [
    "first_length",
    3,
    "int",
    1,
    12,
    "steps in the first row"
   ],
   [
    "longest",
    8,
    "int",
    1,
    20,
    "the most steps in a row"
   ],
   [
    "beat_seconds",
    0.7,
    "float",
    0.3,
    2.0,
    "seconds between the caller's steps"
   ],
   [
    "answer_seconds",
    2.5,
    "float",
    0.5,
    10.0,
    "seconds you have for each arrow"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives: a wrong or late arrow costs one"
   ],
   [
    "points_per_step",
    2,
    "int",
    0,
    100000,
    "points for each step of a row you get right"
   ]
  ]
 },
 "tag": {
  "label": "Tag (3.0.0): do not be it; when you are, tag one back",
  "about": "Tag: several creatures play tag with you. One is it and chases you, and every second you are not it scores. When it tags you, you are it: the others run, and after a moment's head start you must walk into one to pass it on.",
  "word": null,
  "counts": false,
  "items": false,
  "walls": true,
  "finished": "",
  "fields": [
   [
    "players",
    3,
    "int",
    2,
    6,
    "how many creatures play tag with you"
   ],
   [
    "it_speed",
    3.2,
    "float",
    0.5,
    12.0,
    "the speed of the one that is it (3 is one step a second)"
   ],
   [
    "runner_speed",
    3.0,
    "float",
    0.5,
    12.0,
    "the speed of the ones running from you"
   ],
   [
    "points_per_second",
    1,
    "int",
    0,
    1000,
    "points for each second you are not it"
   ],
   [
    "head_start",
    2.0,
    "float",
    0.0,
    10.0,
    "seconds after a tag before the new it can tag"
   ],
   [
    "times_it_allowed",
    0,
    "int",
    0,
    100,
    "the run ends when you have been tagged this many times (0: never)"
   ],
   [
    "it_sound",
    "",
    "sound",
    "creature",
    "The guardian's hum, made by the game",
    "the sound of the one that is it"
   ],
   [
    "runner_sound",
    "",
    "sound",
    "creature",
    "An enemy's sound, made by the game",
    "the sound of the others"
   ]
  ]
 },
 "crossing": {
  "label": "Crossing the road (3.0.0): cross the lanes between the cars",
  "about": "Crossing the road: lanes of traffic lie between you and the far side, which calls. In each lane cars sweep across, and you hear them pass. Cross without being in a car's square. A hit costs a life and puts you back at the start. Each crossing is worth points, and the next road is wider and faster.",
  "word": "Road",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "crossed every road",
  "fields": [
   [
    "lanes_first",
    3,
    "int",
    1,
    12,
    "lanes in the first road"
   ],
   [
    "lanes_most",
    8,
    "int",
    1,
    14,
    "the most lanes"
   ],
   [
    "car_speed",
    7.0,
    "float",
    2.0,
    40.0,
    "a car's speed on the first road (3 is one step a second)"
   ],
   [
    "faster_each",
    0.08,
    "float",
    0.0,
    0.5,
    "how much faster on each road after, as a share"
   ],
   [
    "cars_per_lane",
    1,
    "int",
    1,
    3,
    "cars in each lane"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives: a hit costs one"
   ],
   [
    "points_per_crossing",
    20,
    "int",
    0,
    100000,
    "points for each crossing"
   ],
   [
    "car_sound",
    "",
    "sound",
    "creature",
    "An enemy's sound, made by the game",
    "a car's sound"
   ],
   [
    "goal_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the far side's calling sound"
   ]
  ]
 },
 "mirror": {
  "label": "Mirror twin (3.0.0): steer a twin that moves the opposite way",
  "about": "Mirror twin: a twin you can hear moves the opposite way to every step you take, and stays put when the edge of the room or a wall blocks it. Steer the twin onto the calling spot for points; then the spot moves.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": true,
  "finished": "reached every spot",
  "fields": [
   [
    "mirror",
    "both",
    "choice",
    {
     "both": "Every step is turned round: you go north, it goes south; you go east, it goes west.",
     "left_right": "Only left and right are swapped: north and south it copies you."
    },
    null,
    "how the twin mirrors you"
   ],
   [
    "points_per_target",
    10,
    "int",
    0,
    100000,
    "points each time the twin reaches the spot"
   ],
   [
    "target_distance",
    12,
    "steps",
    6,
    90,
    "how far from the twin each new spot appears, at least"
   ],
   [
    "twin_sound",
    "",
    "sound",
    "item",
    "The event's item sound",
    "the twin's sound"
   ],
   [
    "target_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the spot's calling sound"
   ]
  ]
 },
 "march": {
  "label": "March in time (3.0.0): take a step on every drum beat",
  "about": "March in time: a drum beats, and you collect the usual items. Take one step on every beat. A beat with no step, or a step off the beat, is out of step, and too many end the run. The drum quickens with every item.",
  "word": null,
  "counts": false,
  "items": true,
  "walls": true,
  "finished": "",
  "fields": [
   [
    "beat_seconds",
    0.9,
    "float",
    0.4,
    3.0,
    "seconds between beats at the start"
   ],
   [
    "faster_each",
    0.02,
    "float",
    0.0,
    0.2,
    "how much quicker after each item, as a share"
   ],
   [
    "beat_least",
    0.45,
    "float",
    0.3,
    3.0,
    "the quickest beat, in seconds"
   ],
   [
    "window",
    0.3,
    "float",
    0.1,
    0.6,
    "how near the beat a step must be, in seconds either side"
   ],
   [
    "misses_allowed",
    8,
    "int",
    1,
    200,
    "times out of step before the run ends"
   ],
   [
    "drum_sound",
    "",
    "sound",
    "pickup",
    "A drum, made by the game",
    "the drum"
   ]
  ]
 },
 "count": {
  "label": "Count the chimes (3.0.0): walk as many steps as the chimes rang",
  "about": "Count the chimes: chimes ring a number of times. Walk that many steps forward from where the round began, then press Space. Right is worth points. Wrong costs a life, and the voice says the number. Later rounds ring more chimes, faster.",
  "word": "Round",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "counted every round",
  "fields": [
   [
    "most_first",
    5,
    "int",
    1,
    15,
    "the most chimes in the first round"
   ],
   [
    "more_each",
    1,
    "int",
    0,
    5,
    "each round the most goes up by this"
   ],
   [
    "most",
    12,
    "int",
    1,
    15,
    "the most chimes a round can ever have"
   ],
   [
    "chime_seconds",
    0.55,
    "float",
    0.15,
    2.0,
    "seconds between chimes at the start"
   ],
   [
    "faster_each",
    0.03,
    "float",
    0.0,
    0.3,
    "how much faster each round, as a share"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives: a wrong count costs one"
   ],
   [
    "points_per_round",
    10,
    "int",
    0,
    100000,
    "points for each right count"
   ],
   [
    "chime_sound",
    "",
    "sound",
    "pickup",
    "A bell, made by the game",
    "the chime"
   ]
  ]
 },
 "tide": {
  "label": "Rising tide (3.0.0): reach high ground before the water reaches you",
  "about": "Rising tide: you start at the south edge and the water rises behind you, a row at a time; you hear its edge. High ground calls from the north edge. Treasures on the way are worth points. Reach high ground for points, and the next tide is faster. The water reaching you ends the run.",
  "word": "Tide",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "outran every tide",
  "fields": [
   [
    "row_seconds",
    2.5,
    "float",
    0.3,
    30.0,
    "seconds the water takes to rise one row, at the start"
   ],
   [
    "faster_each",
    0.08,
    "float",
    0.0,
    0.5,
    "how much faster each tide after, as a share"
   ],
   [
    "row_least",
    0.8,
    "float",
    0.2,
    30.0,
    "the fastest it rises, in seconds a row"
   ],
   [
    "treasures",
    4,
    "int",
    0,
    12,
    "treasures on the way"
   ],
   [
    "points_per_treasure",
    5,
    "int",
    0,
    100000,
    "points for each treasure"
   ],
   [
    "points_per_level",
    20,
    "int",
    0,
    100000,
    "points for reaching high ground"
   ],
   [
    "water_sound",
    "",
    "sound",
    "ambience",
    "A river (evt_amb_river), else a tick made by the game",
    "the water's edge"
   ],
   [
    "goal_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the high ground's calling sound"
   ],
   [
    "treasure_sound",
    "",
    "sound",
    "item",
    "The event's item sound",
    "a treasure's sound"
   ]
  ]
 },
 "snake": {
  "label": "Snake (3.0.0): every item makes your tail longer; do not step on it",
  "about": "Snake: collect the usual items, and each one makes your tail longer. The tail follows through the squares you have just left. Stepping onto your own tail ends the run or costs a life. A piece of tail right beside you hisses from its side after each step.",
  "word": null,
  "counts": false,
  "items": true,
  "walls": true,
  "finished": "",
  "fields": [
   [
    "start_tail",
    2,
    "int",
    0,
    50,
    "the tail's length at the start, in squares"
   ],
   [
    "tail_per_item",
    2,
    "int",
    1,
    20,
    "squares the tail grows for each item"
   ],
   [
    "on_bite",
    "end_run",
    "choice",
    {
     "end_run": "The run ends at once.",
     "lose_life": "You lose a life, and the tail is cut in half."
    },
    null,
    "what stepping onto your tail does"
   ],
   [
    "lives",
    3,
    "int",
    1,
    20,
    "lives, when stepping onto the tail costs one"
   ],
   [
    "tail_sound",
    "",
    "sound",
    "creature",
    "A snake's hiss (evt_snake_hiss), else a tick made by the game",
    "the tail's hiss beside you"
   ]
  ]
 },
 "push": {
  "label": "Push the crate (3.0.0): push a humming crate onto the calling spot",
  "about": "Push the crate: a crate hums and a spot calls. Walk into the crate to push it one square the way you are going. It will not move into a wall or the edge of the room, and you cannot pull it. Crate on the spot: points, then a new crate and spot. Space puts the crate somewhere new, for a few points.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": true,
  "finished": "pushed every crate home",
  "fields": [
   [
    "points_per_crate",
    15,
    "int",
    0,
    100000,
    "points for each crate on its spot"
   ],
   [
    "reset_cost",
    5,
    "int",
    0,
    100000,
    "points Space costs to put the crate somewhere new"
   ],
   [
    "crate_distance",
    9,
    "steps",
    6,
    60,
    "how far from the player a new crate appears, at least"
   ],
   [
    "target_distance",
    15,
    "steps",
    6,
    90,
    "how far from the crate its spot appears, at least"
   ],
   [
    "crate_sound",
    "",
    "sound",
    "item",
    "The event's item sound",
    "the crate's hum"
   ],
   [
    "target_sound",
    "",
    "sound",
    "dropoff",
    "The shimmering bell, made by the game",
    "the spot's calling sound"
   ]
  ]
 },
 "code": {
  "label": "Crack the code (3.0.0): find the secret order of the pads by trial",
  "about": "Crack the code: pads stand in a ring round the middle of the room, each humming its own note. They must be stepped on in a secret order. A right pad rings bright; a wrong one buzzes and the order starts again. Find the whole order by trial for points, then a longer code.",
  "word": "Code",
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "cracked every code",
  "fields": [
   [
    "pads_first",
    3,
    "int",
    2,
    8,
    "pads in the first code"
   ],
   [
    "pads_most",
    6,
    "int",
    2,
    8,
    "the most pads"
   ],
   [
    "points_per_code",
    20,
    "int",
    0,
    100000,
    "points for each code"
   ],
   [
    "try_cost",
    1,
    "int",
    0,
    1000,
    "points each wrong pad takes off that code's points"
   ],
   [
    "tries_allowed",
    0,
    "int",
    0,
    500,
    "wrong pads before the run ends (0: never)"
   ]
  ]
 },
 "tables": {
  "label": "Turn the tables (3.0.0): take the power item and the creatures run from you",
  "about": "Turn the tables: collect the usual items while creatures come for you. Now and then a power item appears. Take it, and for a few seconds the creatures run from you, and walking into one brings it down for points. A tick warns you when the power is about to end.",
  "word": null,
  "counts": false,
  "items": true,
  "walls": true,
  "finished": "",
  "fields": [
   [
    "power_every_seconds",
    20,
    "int",
    3,
    600,
    "seconds between power items"
   ],
   [
    "power_lasts_seconds",
    12,
    "int",
    3,
    600,
    "seconds a power item waits to be taken"
   ],
   [
    "power_seconds",
    8.0,
    "float",
    2.0,
    60.0,
    "seconds the power lasts"
   ],
   [
    "points_per_creature",
    10,
    "int",
    0,
    100000,
    "points for each creature you bring down"
   ],
   [
    "power_sound",
    "",
    "sound",
    "item",
    "A star's shimmer, made by the game",
    "the power item's sound"
   ]
  ]
 },
 "map": {
  "label": "Treasure map (3.0.0): follow spoken directions and dig with Space",
  "about": "Treasure map: the voice gives directions from where you stand, such as 6 steps north, then 3 steps east. Walk there, counting your own steps, and press Space to dig. The right square is worth points, and new directions follow. A wrong one loses points, and you get fresh directions from where you now stand. Enter repeats the directions.",
  "word": null,
  "counts": true,
  "items": false,
  "walls": false,
  "finished": "dug up every treasure",
  "fields": [
   [
    "steps_most",
    8,
    "int",
    2,
    20,
    "the most steps in one leg of the directions"
   ],
   [
    "legs_first",
    2,
    "int",
    1,
    3,
    "legs in the first directions"
   ],
   [
    "legs_most",
    3,
    "int",
    1,
    3,
    "the most legs (one more leg after every three treasures)"
   ],
   [
    "points_per_treasure",
    15,
    "int",
    0,
    100000,
    "points for each treasure"
   ],
   [
    "miss_cost",
    3,
    "int",
    0,
    100000,
    "points lost for digging in the wrong square"
   ]
  ]
 }
};

// What a mission's settings are called in a problem's wording.
export const NAMES = {
 "redlight": "Red light, green light",
 "mines": "Minefield",
 "stones": "Stepping stones",
 "pong": "Bat and ball",
 "rival": "Race a rival",
 "thief": "Catch the thief",
 "boss": "Boss",
 "escort": "Escort",
 "gallery": "Shooting gallery",
 "odd": "Odd one out",
 "cover": "Cover the ground",
 "sonar": "Sonar maze",
 "courier": "Courier",
 "dance": "Dance steps",
 "tag": "Tag",
 "crossing": "Crossing the road",
 "mirror": "Mirror twin",
 "march": "March in time",
 "count": "Count the chimes",
 "tide": "Rising tide",
 "snake": "Snake",
 "push": "Push the crate",
 "code": "Crack the code",
 "tables": "Turn the tables",
 "map": "Treasure map"
};

// Settings that come in pairs: the first may not be more than the second.
export const PAIRS = [["redlight", "green_least", "green_most"], ["redlight", "red_least", "red_most"], ["mines", "mines_share", "share_most"], ["stones", "first_length", "longest"], ["pong", "ball_speed", "top_speed"], ["gallery", "shortest", "up_seconds"], ["odd", "things_first", "things_most"], ["odd", "difference_least", "difference_first"], ["dance", "first_length", "longest"], ["crossing", "lanes_first", "lanes_most"], ["march", "beat_least", "beat_seconds"], ["count", "most_first", "most"], ["tide", "row_least", "row_seconds"], ["code", "pads_first", "pads_most"], ["map", "legs_first", "legs_most"]];

// Where an empty sound setting plays a recording from the packs when it is there.
export const REC_DEFAULTS = {
 "pong.ball_sound": "evt_ball_bounce.ogg",
 "boss.roar_sound": "evt_dragon_roar.ogg",
 "snake.tail_sound": "evt_snake_hiss.ogg",
 "tide.water_sound": "evt_amb_river.ogg"
};

// What can end a run with no clock, for the missions that do not always end by themselves.
export const NEEDS = {
 "gallery": [
  "misses_allowed",
  "a number of misses allowed"
 ],
 "courier": [
  "misses_allowed",
  "a number of customers that may be lost, and customers that lose patience"
 ],
 "tag": [
  "times_it_allowed",
  "a number of times you may be tagged"
 ],
 "code": [
  "tries_allowed",
  "a number of wrong pads allowed"
 ],
 "cover": [
  "squares_to_cover",
  "a number of squares to cover"
 ],
 "rival": [
  null,
  "a set number of items in total"
 ],
 "tables": [
  null,
  "a set number of items in total"
 ],
 "sonar": [
  null,
  null
 ],
 "mirror": [
  null,
  null
 ],
 "push": [
  null,
  null
 ],
 "map": [
  null,
  null
 ]
};

// The help's entry for each mission, in the desktop's words (keys; the help turns them into gestures).
export const HELP = [
 {
  "title": "Events Red Light, Green Light",
  "desc": "A goal calls some steps away. Walk only while the music plays. When it stops, any step costs a life or ends the run. Each goal reached is worth points, and the next round's music is shorter. Enter tells you the round, whether the light is green or red, and your lives.",
  "sound": null
 },
 {
  "title": "Events Minefield",
  "desc": "Cross from the south edge of the room to the goal at the north edge. After every step you hear one click for each mine in the eight squares round you. There is always a safe way through. Each crossing is worth points, and the next field has more mines. Enter tells you the field, the mines beside you and your lives.",
  "sound": null
 },
 {
  "title": "Events Stepping Stones",
  "desc": "A path of stones crosses the water. The game plays the path once, each stone's note from where it lies. Then walk it from memory: every step must land on the next stone, ahead, left or right. Space plays the path again, a few times. Each crossing is worth points and the next path is longer. Enter tells you the crossing, how many stones you have passed, your lives and your replays.",
  "sound": null
 },
 {
  "title": "Events Bat and Ball",
  "desc": "A ball comes down the room toward you, bouncing off the side walls, and you hear where it is. Be in its line when it reaches your row to hit it back. Every hit is worth points and the ball gets faster. A miss costs a life. Enter tells you your hits and your lives.",
  "sound": null
 },
 {
  "title": "Events Race a Rival",
  "desc": "The items are the usual ones, but a rival you can hear walks to the nearest and takes it. The run ends on the clock or when the set number of items is gone. Finish with more than the rival for a bonus. Enter tells you how many you have and how many the rival has.",
  "sound": null
 },
 {
  "title": "Events Catch the Thief",
  "desc": "Treasures sit about the room. A thief comes in from an edge, takes the nearest and runs for an edge. Walk into the thief to catch it: points, and the treasure goes back. If it gets out, that treasure is gone. The run ends when every treasure is gone. Enter tells you your catches and the treasures left.",
  "sound": null
 },
 {
  "title": "Events Boss",
  "desc": "One great creature stalks you, roars, then charges in a straight line at where you stood. Step aside. After a charge it is tired and pants for a few seconds: only then do your shots, with Space, hurt it. Its touch costs a life. Bring it down for points, and a stronger one comes. Enter tells you which boss it is, the hits it still needs, whether it is tired, and your lives.",
  "sound": null
 },
 {
  "title": "Events Escort",
  "desc": "A friend walks across the room to its home, but only while you stay near it. Raiders come from the walls for the friend: shoot them with Space. Each one that reaches the friend costs the friend a life. Every trip home is worth points, and later trips bring more raiders. Enter tells you the trip and the friend's lives.",
  "sound": null
 },
 {
  "title": "Events Shooting Gallery",
  "desc": "Targets pop up ahead of you, one at a time, each for a few seconds. Step left or right until one is centred between your ears, and shoot with Space. Some are friends, with a different sound: shooting one costs points. A target that gets away is a miss, and too many misses end the run. Enter tells you your hits and your misses.",
  "sound": null
 },
 {
  "title": "Events Odd One Out",
  "desc": "Several things sound the same note, one after another, but one of them is a little higher or lower. Step onto the odd one. Each round has more things and a smaller difference. Enter tells you the round, how many things there are, and your lives.",
  "sound": null
 },
 {
  "title": "Events Cover the Ground",
  "desc": "Every square you step on for the first time scores and chimes; a square you have already walked on does not. A run of new squares in a row earns a bonus. It can end when a set number are covered. Enter tells you how many squares you have covered.",
  "sound": null
 },
 {
  "title": "Events Sonar Maze",
  "desc": "A labyrinth of walls with a silent way out. Space sends a ping: the walls near you answer with ticks from where they stand, the nearest first, and the way out answers with a chime from wherever it is. Reach the way out for points and a new maze. The Walls block must be turned on. Enter tells you the maze and the pings you have left.",
  "sound": null
 },
 {
  "title": "Events Courier",
  "desc": "A customer calls. Step onto them to hear their order, a sound, once. Shelves stand in a row, each with its own sound: step onto the one that matches, then bring it back to the customer. Right is worth points; wrong loses some. Customers lose patience, and too many lost end the run. Enter tells you how many you have served and lost, whether you are carrying something, and the customer's patience.",
  "sound": null
 },
 {
  "title": "Events Dance Steps",
  "desc": "You stand still. A caller plays a row of steps, each a note from ahead, behind, left or right. Then press the arrows in the same order. Right is worth points and the next row is longer. A wrong or late arrow costs a life and the row plays again. Enter tells you the round, the number of steps and your lives.",
  "sound": null
 },
 {
  "title": "Events Tag",
  "desc": "Several creatures play tag with you. One is it and chases you, and every second you are not it scores. When it tags you, you are it: the others run, and after a moment's head start you must walk into one to pass it on. Enter tells you whether you are it, and how many times you have been tagged.",
  "sound": null
 },
 {
  "title": "Events Crossing the Road",
  "desc": "Lanes of traffic lie between you and the far side, which calls. In each lane cars sweep across, and you hear them pass. Cross without being in a car's square. A hit costs a life and puts you back at the start. Each crossing is worth points, and the next road is wider and faster. Enter tells you the road, its lanes and your lives.",
  "sound": null
 },
 {
  "title": "Events Mirror Twin",
  "desc": "A twin you can hear moves the opposite way to every step you take, and stays put when the edge of the room or a wall blocks it. Steer the twin onto the calling spot for points; then the spot moves. Enter tells you how many spots the twin has reached.",
  "sound": null
 },
 {
  "title": "Events March in Time",
  "desc": "A drum beats, and you collect the usual items. Take one step on every beat. A beat with no step, or a step off the beat, is out of step, and too many end the run. The drum quickens with every item. Enter tells you your items and how many times you have been out of step.",
  "sound": null
 },
 {
  "title": "Events Count the Chimes",
  "desc": "Chimes ring a number of times. Walk that many steps forward from where the round began, then press Space. Right is worth points. Wrong costs a life, and the voice says the number. Later rounds ring more chimes, faster. Enter tells you the round and your lives.",
  "sound": null
 },
 {
  "title": "Events Rising Tide",
  "desc": "You start at the south edge and the water rises behind you, a row at a time; you hear its edge. High ground calls from the north edge. Treasures on the way are worth points. Reach high ground for points, and the next tide is faster. The water reaching you ends the run. Enter tells you the tide and how many steps behind you the water is.",
  "sound": null
 },
 {
  "title": "Events Snake",
  "desc": "Collect the usual items, and each one makes your tail longer. The tail follows through the squares you have just left. Stepping onto your own tail ends the run or costs a life. A piece of tail right beside you hisses from its side after each step. Enter tells you your items and how long your tail is.",
  "sound": null
 },
 {
  "title": "Events Push the Crate",
  "desc": "A crate hums and a spot calls. Walk into the crate to push it one square the way you are going. It will not move into a wall or the edge of the room, and you cannot pull it. Crate on the spot: points, then a new crate and spot. Space puts the crate somewhere new, for a few points. Enter tells you how many crates are home.",
  "sound": null
 },
 {
  "title": "Events Crack the Code",
  "desc": "Pads stand in a ring round the middle of the room, each humming its own note. They must be stepped on in a secret order. A right pad rings bright; a wrong one buzzes and the order starts again. Find the whole order by trial for points, then a longer code. Enter tells you the code, how many pads you have right, and your wrong tries.",
  "sound": null
 },
 {
  "title": "Events Turn the Tables",
  "desc": "Collect the usual items while creatures come for you. Now and then a power item appears. Take it, and for a few seconds the creatures run from you, and walking into one brings it down for points. A tick warns you when the power is about to end. Enter tells you your items, how many creatures you have brought down, and how long the power lasts.",
  "sound": null
 },
 {
  "title": "Events Treasure Map",
  "desc": "The voice gives directions from where you stand, such as 6 steps north, then 3 steps east. Walk there, counting your own steps, and press Space to dig. The right square is worth points, and new directions follow. A wrong one loses points, and you get fresh directions from where you now stand. Enter repeats the directions.",
  "sound": null
 }
];

export function defaultsOf(m) {
  const out = {};
  for (const [key, value] of MORE[m].fields) out[key] = Array.isArray(value) ? [...value] : value;
  return out;
}
