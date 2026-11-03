// What an Endless Labyrinth event file may say, and the checks every event goes
// through: the part of the desktop's event_schema.py the game needs to read and
// check an event. Times are world time (UTC), written like 2026-10-31T12:00:00Z.

export const FORMAT = 1;

// The missions the game knows how to run.
export const MISSIONS = ['collect', 'survive', 'decoys', 'deliver', 'catch', 'relay', 'follow', 'hunt', 'seek',
  'order', 'escape', 'memory', 'pairs', 'detector', 'dodge', 'defend', 'hold', 'sneak', 'bomb', 'rescue', 'reflex',
  'chairs', 'fishing', 'steps', 'keys', 'whack', 'herd', 'rhythm', 'sort', 'lamps'];

const REFLEX_DIRECTIONS = ['four', 'two'];
const BOMB_FUSE_STARTS = ['appears', 'picked_up'];
const SORT_WRONG = ['end_run', 'lose_points'];
const MEMORY_WRONG = ['end_run', 'lose_points'];
const DROPOFF_PLACES = ['center', 'corner', 'edge', 'random'];
const ORDER_DIRECTIONS = ['low_first', 'high_first'];
const ORDER_WRONG = ['end_run', 'lose_points', 'lose_time'];
const ITEM_DIRECTIONS = ['anywhere', 'ahead', 'behind', 'left', 'right', 'sides', 'not_behind'];

// Older event files may say where an event is played ('mode') and hold settings for
// the game's own modes ('mode_settings'). Events are now always played in an event
// room, so 'mode' may only be 'room', and 'mode_settings' is read and ignored.
export const LEGACY_KEYS = ['mode', 'mode_settings'];

const ROOMS = ['cathedral', 'hall', 'lab', 'tower', 'battle', 'open'];
const ROOM_SIZES = { small: 20, medium: 30, large: 40, huge: 55 };
const AMBIENCES = ['cathedral', 'night', 'labyrinth', 'tower', 'battle', 'none'];
const HAZARD_SOUNDS = ['guardian', 'enemy'];
const HAZARD_BEHAVIORS = ['wander', 'hunt', 'guard'];
const HAZARD_HOMES = ['corner', 'edge', 'center', 'anywhere'];
const HAZARD_TOUCH = ['end_run', 'lose_time', 'lose_points'];

// The item sound sets, all made by the game: what the help's demos say of each.
export const THEMES = {
  pumpkin: 'Hollow wooden knocks with an eerie whistle; collecting is a spooky rising chime.',
  bell: 'A small hand bell ringing; collecting is a bright bell chord.',
  gem: 'A crystal sparkle; collecting is a glassy rising run.',
  star: 'A shimmering rising sweep; collecting is a twinkling burst.',
  snowflake: 'Soft icy tinkles; collecting is a cold glassy chord.',
  heart: 'A slow warm heartbeat; collecting is a warm rising chord.',
};

export const DEFAULTS = {
  format: FORMAT, id: '', enabled: true, protected: false, name: '', description: '', start: '', end: '',
  mode: 'room', mode_settings: {}, mission: 'collect', time_limit_seconds: 120, room: 'cathedral', room_size: 50,
  ambience: 'cathedral', ambience_zones: [], ambience_volume: 1.0, zones_volume: 1.0,
  item: {
    theme: 'pumpkin', name: 'pumpkin', plural: 'pumpkins', points: 1, at_once: 1, total: 0, total_max: 0,
    hide_left: false, min_distance: 10, max_distance: 0, direction: 'anywhere', volume: 1.0, beacon_file: '',
    beacon_set: [], pickup_file: '', all_found_bonus: 0, time_bonus: 0, bonus_chance: 0.0, bonus_points: 10,
    bonus_theme: 'star', bonus_file: '',
  },
  decoys: {
    real_first_level: 3, real_per_level: 1, real_most: 10, fakes_first_level: 2, fakes_per_level: 1, fakes_most: 15,
    distortion: 0.7, fake_closest: 8, rings_first_level: 1, rings_per_level: 0, rings_most: 20, rings_random: false,
    fakes_match_real: false, ring_every_seconds: 0.0, points_per_level: 10, exit_sound: 'exit_morse',
    exit_shimmer: false, dark_exit_chance: 0.0, dark_exit_first_level: 2, dark_exit_sound: '', dark_exit_volume: 1.0,
    announce_levels: true,
  },
  survive: { points_per_second: 1 },
  deliver: { dropoff: 'center', dropoff_moves: false, dropoff_sound: '', delivered_sound: '', carry_most: 1, drop_on_touch: true },
  catch: { speed: 2.0, flee_distance: 18, wanders: true },
  relay: { seconds_first: 20, seconds_less_each: 1, seconds_least: 6 },
  follow: { speed: 1.2, near_distance: 15, lost_seconds: 8, points_per_second: 2, stops: true },
  hunt: { time_bonus: 0, ammo_every_seconds: 0, ammo_amount: 5 },
  seek: { pings: 0, ping_wait: 3.0, ping_sound: '', auto_ping_seconds: 0 },
  order: { first_round: 3, per_round: 1, most: 8, direction: 'low_first', note_gap: 2, wrong: 'end_run', penalty: 10, points_per_round: 10, wrong_sound: '' },
  memory: { pads: 4, pad_distance: 18, first_length: 2, longest: 12, note_gap: 0.8, pads_call: true, wrong: 'end_run', penalty: 10, points_per_round: 10 },
  pairs: { first_pairs: 3, more_each_round: 1, most: 8, note_gap: 3, points_per_pair: 5, points_per_round: 10 },
  detector: { slowest: 1.5, fastest: 0.12, range: 60, directional: false, beep_sound: '' },
  dodge: { every_seconds: 4.0, faster_each: 0.1, least_seconds: 1.5, warning_seconds: 2.0, aim_distance: 9, blast_distance: 6, lives: 3, points_per_dodge: 2, falling_sound: '', landing_sound: '' },
  defend: { treasure_lives: 3, respawn_seconds: 3, faster_each: 0.05, treasure_sound: '' },
  hold: { radius: 9, move_seconds: 12, points_per_second: 2, warn_before_move: true },
  sneak: { hearing: 15, noise_per_step: 0.25, quiet_per_second: 0.1, awake_seconds: 10, snore_sound: '' },
  bomb: { fuse_seconds: 25, shorter_each: 1.0, shortest: 8, fuse_starts: 'appears', lives: 3, safe_place: 'center', safe_sound: '', bang_sound: '' },
  rescue: { follow_speed: 3.0, lose_distance: 24, home: 'center', home_sound: '' },
  reflex: { directions: 'four', window_seconds: 1.5, faster_each: 0.03, shortest: 0.5, gap_seconds: 1.0, lives: 3, cue_sound: '' },
  chairs: { music_sound: '', music_shortest: 4, music_longest: 12, chairs: 3, seconds_first: 6.0, less_each: 0.3, shortest: 2.5, chair_distance: 12, points_per_round: 5 },
  fishing: { cast_distance: 30, fish_speed: 0.6, cast_wait: 1.5, cast_sound: '', aim: 0.35 },
  steps: { start: 60, per_item: 10, warn_at: 5 },
  keys: { door_sound: 'exit_morse', key_sound: '', door_distance: 24, points_per_room: 10, more_creatures_each_room: 0 },
  whack: { every_seconds: 1.5, up_seconds: 3.0, less_each: 0.05, shortest: 1.2, near: 15, misses_allowed: 0, hide_sound: '' },
  herd: { pen: 'corner', pen_radius: 12, pen_sound: '', speed: 1.6, flee_distance: 12 },
  rhythm: { beats_per_minute: 60, faster_every: 8, faster_by: 4, fastest: 160, window: 0.15, misses_allowed: 5, beat_sound: '' },
  sort: { wrong: 'lose_points', penalty: 5 },
  lamps: { lamps: 4, burn_seconds: 20, fade_seconds: 8, shorter_each: 0.5, shortest: 6, out_allowed: 1, light_sound: '' },
  escape: { first_room: 1, more_each_room: 1, most: 8, points_per_room: 10, exit_sound: 'exit_morse', exit_distance: 30 },
  time_credits: { enabled: false, values: [10, 15, 20], weights: [55, 30, 15], every_seconds: 30, first_after_seconds: 20, lasts_seconds: 0, min_distance: 12, max_at_once: 1 },
  clock: { on: true, announce_every_seconds: 60, countdown_seconds: 15 },
  hazards: {
    count: 0, name: 'beast', sound: 'guardian', behavior: 'guard', home: 'corner', speed: 1.5, react_distance: 14,
    on_touch: 'end_run', penalty: 15, can_be_shot: false, hits_to_down: 3, points_for_down: 10, respawn_seconds: 0,
    volume: 1.0, lives: 1,
  },
  weapon: { enabled: false, start_shots: 8 },
  messages: { start: '', end: '', start_sound: '', end_sound: '' },
  medals: { bronze: 0, silver: 0, gold: 0 },
  signature: '',
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const FILE_RE = /^[A-Za-z0-9_\-. ]{1,80}\.(ogg|wav|mp3|flac)$/;
const isFile = (v) => typeof v === 'string' && FILE_RE.test(v);
const isDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Python's truth: 0, '', [], {}, None and False are false.
const T = (v) => !(v === null || v === undefined || v === false || v === 0 || v === ''
  || (Array.isArray(v) && v.length === 0) || (isDict(v) && Object.keys(v).length === 0));

// The pitched notes of In order and Find the pairs come from this many semitones
// either side of the recording.
export const NOTE_SPREAD = 12;

// Missions whose whole point is their ordinary items: the game lays out at least one.
export const ITEMS_NEEDED = ['fishing', 'rescue', 'sort', 'sneak', 'steps'];
export const TOTAL_UNUSED = ['order', 'pairs', 'memory', 'chairs', 'hold', 'lamps', 'dodge', 'reflex', 'rhythm',
  'follow', 'decoys', 'keys'];

// Python's round(): halves go to the even neighbour.
export function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// '2026-10-31T12:00:00Z' -> seconds since 1970, or null (Python's fromisoformat).
export function parseUtc(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?)?)?(Z|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)?$/
    .exec(text.trim());
  if (!m) return null;
  const [y, mo, d, h = '0', mi = '0', s = '0', frac = '', tz] = m.slice(1);
  const Y = +y; const Mo = +mo; const Dd = +d;
  if (Mo < 1 || Mo > 12 || Dd < 1 || Dd > new Date(Date.UTC(Y, Mo, 0)).getUTCDate() || +h > 23 || +mi > 59 || +s > 59) return null;
  let t = Date.UTC(Y, Mo - 1, Dd, +h, +mi, +s) / 1000 + (frac ? Number('0.' + frac) : 0);
  if (tz && tz !== 'Z') {
    const tm = /^([+-])(\d{2}):?(\d{2})?:?(\d{2})?$/.exec(tz);
    const off = (+tm[2]) * 3600 + (+(tm[3] || 0)) * 60 + (+(tm[4] || 0));
    t -= (tm[1] === '-' ? -1 : 1) * off;
  }
  return t;
}

// A length of time in words: '7 days', '1 day 12 hours', '30 minutes'.
export function describeDuration(seconds) {
  let s = pyRound(Math.max(0, seconds));
  const parts = [];
  for (const [size, word] of [[86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
    const n = Math.floor(s / size);
    s %= size;
    if (n) parts.push(`${n} ${word}` + (n === 1 ? '' : 's'));
  }
  if (!parts.length) parts.push(`${s} second` + (s === 1 ? '' : 's'));
  return parts.slice(0, 2).join(' ');
}

// 'stopped', 'upcoming', 'live' or 'ended', for a checked event at a time.
export function status(event, now) {
  if (!(event.enabled === undefined ? true : event.enabled)) return 'stopped';
  if (now < event._start) return 'upcoming';
  if (now >= event._end) return 'ended';
  return 'live';
}

function merge(defaults, given) {
  const out = structuredClone(defaults);
  if (isDict(given)) {
    for (const [k, v] of Object.entries(given)) {
      if (k in out && isDict(out[k]) && isDict(v)) out[k] = merge(out[k], v);
      else out[k] = v;
    }
  }
  return out;
}

const fmtNum = (v) => (typeof v === 'number' ? String(v) : String(v));

function num(errors, label, value, lo, hi, integer = true) {
  if (typeof value === 'boolean' || typeof value !== 'number') {
    errors.push(`${label} must be a number.`);
    return lo;
  }
  if (value < lo || value > hi) {
    errors.push(`${label} must be between ${fmtNum(lo)} and ${fmtNum(hi)}; it is ${fmtNum(value)}.`);
    return Math.min(hi, Math.max(lo, value));
  }
  return integer ? Math.trunc(value) : value;
}

// Check an event. Returns [event, errors]: the event with every default filled in,
// and a list of plain-English problems. The game only runs an event with no problems
// at all. formatIsInt: whether the file wrote its format as a whole number (Python
// tells 1 from 1.0; JavaScript does not).
export function checkEvent(data, formatIsInt = true) {
  const errors = [];
  if (!isDict(data)) return [null, ['The file is not an event: it must be one { ... } block.']];
  const unknown = Object.keys(data).filter((k) => !(k in DEFAULTS));
  for (const [section, inner] of Object.entries(DEFAULTS)) {
    if (section === 'mode_settings') continue;
    if (isDict(inner) && isDict(data[section])) {
      unknown.push(...Object.keys(data[section]).filter((k) => !(k in inner)).map((k) => `${section}.${k}`));
    } else if (isDict(inner) && section in data && !isDict(data[section])) {
      errors.push(`The ${section} settings must be a { ... } block.`);
    }
  }
  if (unknown.length) errors.push('Settings the game does not know (check the spelling): ' + unknown.sort().join(', ') + '.');
  if (errors.length) return [null, errors];
  const ev = merge(DEFAULTS, data);
  if (typeof ev.format !== 'number' || !Number.isInteger(ev.format) || !formatIsInt || ev.format > FORMAT) {
    errors.push('This event was made for a newer version of the game; update the game to play it.');
  }
  if (typeof ev.enabled !== 'boolean') errors.push('Whether the event is on must be true or false.');
  if (typeof ev.protected !== 'boolean') errors.push('Whether the event is protected must be true or false.');
  if (typeof ev.id !== 'string' || !ID_RE.test(ev.id)) errors.push('The id must be lowercase letters, numbers and dashes, like pumpkin-hunt-2026.');
  if (typeof ev.name !== 'string' || !ev.name.trim()) errors.push('The event needs a name.');
  if (typeof ev.description !== 'string') errors.push('The description must be text.');
  if (typeof ev.signature !== 'string') errors.push('The signature must be text.');
  const start = parseUtc(ev.start); const end = parseUtc(ev.end);
  if (start === null) errors.push('The start time is missing or not in the form 2026-10-31T12:00:00Z.');
  if (end === null) errors.push('The end time is missing or not in the form 2026-10-31T12:00:00Z.');
  if (start !== null && end !== null) {
    if (end - start < 60) errors.push('The event must last at least one minute.');
    else if (end - start > 366 * 86400) errors.push('The event can last at most a year.');
  }
  ev._start = start || 0.0; ev._end = end || 0.0;

  if (ev.mode !== 'room') errors.push(`Events are always played in an event room now; this file names the game mode '${ev.mode}', which events no longer use.`);
  if (!MISSIONS.includes(ev.mission)) errors.push(`Unknown mission '${ev.mission}'. The game knows: ` + MISSIONS.join(', ') + '.');
  ev.time_limit_seconds = num(errors, 'The time limit', ev.time_limit_seconds, 0, 3600);
  if (typeof ev.clock.on !== 'boolean') {
    errors.push('Whether the event has a clock must be true or false.');
    ev.clock.on = true;
  }
  if (ev.time_limit_seconds === 0) ev.clock.on = false;          // the old way of saying there is no clock
  else if (ev.clock.on && ev.time_limit_seconds < 10) errors.push('The time limit must be at least 10 seconds.');
  if (!ROOMS.includes(ev.room)) errors.push(`Unknown room '${ev.room}'. Choose from: ` + ROOMS.join(', ') + '.');
  if (typeof ev.room_size === 'string' && ev.room_size in ROOM_SIZES) ev.room_size = ROOM_SIZES[ev.room_size];
  ev.room_size = num(errors, 'The room size', ev.room_size, 12, 80);
  if (!Array.isArray(ev.ambience_zones) || ev.ambience_zones.length > 8 || !ev.ambience_zones.every(isFile)) {
    errors.push('The background zones must be a list of up to 8 sound file names.');
    ev.ambience_zones = [];
  }
  if (!AMBIENCES.includes(ev.ambience) && !isFile(ev.ambience)) {
    errors.push(`Unknown ambience '${ev.ambience}'. Choose from: ` + AMBIENCES.join(', ') + ', or a sound file such as evt_amb_rain.ogg.');
  }

  const it = ev.item;
  if (!(it.theme in THEMES)) errors.push(`Unknown item sound '${it.theme}'. Choose from: ` + Object.keys(THEMES).join(', ') + '.');
  for (const k of ['name', 'plural']) if (typeof it[k] !== 'string' || !it[k].trim()) errors.push(`The item needs a ${k}.`);
  it.points = num(errors, 'Points per item', it.points, 1, 1000);
  it.at_once = num(errors, 'Items out at once', it.at_once, 0, 10);
  if (ev.mission === 'collect' && it.at_once < 1) errors.push('A collecting event needs at least one item out at a time.');
  it.total = num(errors, 'Total items', it.total, 0, 500);
  it.total_max = num(errors, 'The most items for a random total', it.total_max, 0, 500);
  if (it.total_max && !it.total) {
    errors.push('A random total needs the fewest items set too: set the total to the fewest, and the most to the largest, or set the most to 0 for no random total.');
  } else if (it.total_max && it.total_max < it.total) {
    errors.push(`The most items for a random total (${it.total_max}) must be at least the total (${it.total}), or 0 for no random total.`);
  }
  if (typeof it.hide_left !== 'boolean') errors.push('Whether Enter says how many items are left must be true or false.');
  it.min_distance = num(errors, "The item's nearest distance", it.min_distance, 0, 150);
  it.max_distance = num(errors, "The item's farthest distance", it.max_distance, 0, 200);
  it.volume = num(errors, 'The item volume', it.volume, 0.1, 2.0, false);
  it.all_found_bonus = num(errors, 'The all found bonus', it.all_found_bonus, 0, 100000);
  it.time_bonus = num(errors, 'The time bonus', it.time_bonus, 0, 10000);
  it.bonus_chance = num(errors, 'The chance of a bonus item', it.bonus_chance, 0.0, 1.0, false);
  it.bonus_points = num(errors, 'Points for a bonus item', it.bonus_points, 0, 100000);
  if (!(it.bonus_theme in THEMES)) errors.push(`Unknown bonus item sound '${it.bonus_theme}'. Choose from: ` + Object.keys(THEMES).join(', ') + '.');
  if (T(it.bonus_file) && !isFile(it.bonus_file)) errors.push("The bonus item's recording must be a sound file name, or empty.");
  if (it.bonus_chance > 0 && !T(it.bonus_file) && !T(it.beacon_file) && !T(it.beacon_set)
      && it.bonus_theme === it.theme) {
    errors.push('A bonus item needs a sound of its own, different from the usual items, so it can be told apart.');
  }
  ev.ambience_volume = num(errors, 'The background loudness', ev.ambience_volume, 0.0, 2.0, false);
  ev.zones_volume = num(errors, "The background zones' loudness", ev.zones_volume, 0.0, 2.0, false);
  const md = ev.medals;
  for (const k of ['bronze', 'silver', 'gold']) md[k] = num(errors, `The score for a ${k} medal`, md[k], 0, 10000000);
  const set = ['bronze', 'silver', 'gold'].map((k) => md[k]).filter((v) => v);
  const sorted = [...set].sort((a, b) => a - b);
  if (set.some((v, i) => v !== sorted[i]) || new Set(set).size !== set.length) {
    errors.push('Medal scores must rise from bronze to silver to gold (0 means no such medal).');
  }
  const dc = ev.decoys;
  dc.real_first_level = num(errors, 'Real items on level 1', dc.real_first_level, 1, 30);
  dc.real_per_level = num(errors, 'More real items each level', dc.real_per_level, 0, 10);
  dc.real_most = num(errors, 'The most real items in a level', dc.real_most, 1, 30);
  dc.fakes_first_level = num(errors, 'Fakes on level 1', dc.fakes_first_level, 0, 30);
  dc.fakes_per_level = num(errors, 'More fakes each level', dc.fakes_per_level, 0, 10);
  dc.fakes_most = num(errors, 'The most fakes in a level', dc.fakes_most, 0, 30);
  dc.distortion = num(errors, 'How warped the fakes sound', dc.distortion, 0.2, 1.0, false);
  dc.fake_closest = num(errors, "A fake's nearest distance", dc.fake_closest, 4, 100);
  dc.rings_first_level = num(errors, 'Rings on level 1', dc.rings_first_level, 1, 50);
  dc.rings_per_level = num(errors, 'More rings each level', dc.rings_per_level, 0, 10);
  dc.rings_most = num(errors, 'The most rings a level asks for', dc.rings_most, 1, 50);
  dc.ring_every_seconds = num(errors, 'How often every bell rings', dc.ring_every_seconds, 0.0, 5.0, false);
  if (dc.ring_every_seconds > 0 && dc.ring_every_seconds < 0.5) {
    errors.push("How often every bell rings must be 0, for each recording's own length, or at least half a second.");
  }
  if (typeof dc.rings_random !== 'boolean') errors.push('Whether the rings are random must be true or false.');
  if (typeof dc.fakes_match_real !== 'boolean') errors.push("Whether the fakes match the real one's note must be true or false.");
  dc.points_per_level = num(errors, 'Points per level', dc.points_per_level, 0, 100000);
  if (typeof dc.announce_levels !== 'boolean') errors.push('Whether levels are announced must be true or false.');
  if (dc.exit_sound !== 'exit_morse' && !isFile(dc.exit_sound)) errors.push('The exit sound must be exit_morse or a sound file name.');
  if (typeof dc.exit_shimmer !== 'boolean') errors.push('Whether the exit shimmers must be true or false.');
  dc.dark_exit_chance = num(errors, 'The chance of a false exit', dc.dark_exit_chance, 0.0, 1.0, false);
  dc.dark_exit_volume = num(errors, 'How loud the false exit is', dc.dark_exit_volume, 0.1, 2.0, false);
  dc.dark_exit_first_level = num(errors, 'The first level with a false exit', dc.dark_exit_first_level, 1, 1000);
  if (T(dc.dark_exit_sound) && !isFile(dc.dark_exit_sound)) errors.push("The false exit's sound must be a sound file name.");
  if (ev.mission === 'decoys' && dc.dark_exit_chance > 0 && !dc.dark_exit_sound) errors.push('A false exit needs its own sound, so it can be told apart from the real one.');
  if (ev.mission === 'decoys' && dc.real_most + dc.fakes_most > 36) errors.push('A decoys level can hold at most 36 real items and fakes together.');
  ev.survive.points_per_second = num(errors, 'Points per second survived', ev.survive.points_per_second, 0, 1000);
  if (!ITEM_DIRECTIONS.includes(it.direction)) {
    errors.push('Where items appear must be one of: ' + ITEM_DIRECTIONS.join(', ') + '.');
    it.direction = 'anywhere';
  }
  if (it.max_distance && it.max_distance <= it.min_distance) errors.push("The item's farthest distance must be more than its nearest, or 0 for anywhere.");
  if (!Array.isArray(it.beacon_set) || !it.beacon_set.every(isFile)) {
    errors.push("The item's beacon set must be a list of sound file names, or empty.");
    it.beacon_set = [];
  }
  for (const k of ['beacon_file', 'pickup_file']) {
    if (T(it[k]) && !isFile(it[k])) errors.push(`The item's ${k.replace('_', ' ')} must be a sound file name like my_sound.ogg, or empty.`);
  }

  const tc = ev.time_credits;
  if (typeof tc.enabled !== 'boolean') errors.push('Time credits on or off must be true or false.');
  if (!Array.isArray(tc.values) || !tc.values.length) {
    errors.push('Time credit values must be a list of seconds, like [10, 15, 20].');
    tc.values = [10];
  } else {
    if (tc.values.length > 6) {
      errors.push(`Time credits can have at most six values; this event has ${tc.values.length}.`);
      if (Array.isArray(tc.weights) && tc.weights.length === tc.values.length) tc.weights = tc.weights.slice(0, 6);
    }
    tc.values = tc.values.map((v) => num(errors, 'A time credit value', v, 1, 600)).slice(0, 6);
  }
  if (!Array.isArray(tc.weights) || tc.weights.length !== tc.values.length) {
    errors.push('Time credit weights must be a list the same length as the values.');
    tc.weights = tc.values.map(() => 1);
  } else {
    tc.weights = tc.weights.map((w) => num(errors, 'A time credit weight', w, 1, 1000));
  }
  tc.every_seconds = num(errors, 'How often credits appear', tc.every_seconds, 1, 3600);
  tc.first_after_seconds = num(errors, 'When the first credit appears', tc.first_after_seconds, 0, 3600);
  tc.lasts_seconds = num(errors, 'How long a credit lasts', tc.lasts_seconds, 0, 3600);
  tc.min_distance = num(errors, "A credit's nearest distance", tc.min_distance, 0, 150);
  tc.max_at_once = num(errors, 'Credits out at once', tc.max_at_once, 1, 5);

  const hz = ev.hazards;
  hz.count = num(errors, 'The number of hazards', hz.count, 0, 10);
  if (typeof hz.name !== 'string' || !hz.name.trim()) errors.push('The hazard needs a name.');
  if (!HAZARD_SOUNDS.includes(hz.sound) && !isFile(hz.sound)) errors.push('The hazard sound must be guardian, enemy, or a sound file name like beast.ogg.');
  for (const [key, table] of [['behavior', HAZARD_BEHAVIORS], ['home', HAZARD_HOMES], ['on_touch', HAZARD_TOUCH]]) {
    if (!table.includes(hz[key])) errors.push(`The hazard ${key.replace('_', ' ')} must be one of: ` + table.join(', ') + '.');
  }
  hz.speed = num(errors, 'The hazard speed', hz.speed, 0.2, 8.0, false);
  hz.react_distance = num(errors, 'The hazard reaction distance', hz.react_distance, 2, 150);
  hz.penalty = num(errors, 'The hazard penalty', hz.penalty, 0, 10000);
  hz.hits_to_down = num(errors, 'Hits to bring a hazard down', hz.hits_to_down, 1, 100);
  hz.points_for_down = num(errors, 'Points for bringing a hazard down', hz.points_for_down, 0, 10000);
  hz.respawn_seconds = num(errors, 'The hazard respawn time', hz.respawn_seconds, 0, 3600);
  hz.volume = num(errors, 'The hazard volume', hz.volume, 0.1, 2.5, false);
  hz.lives = num(errors, 'Lives', hz.lives, 1, 9);
  if (typeof hz.can_be_shot !== 'boolean') errors.push('Whether a hazard can be shot must be true or false.');
  const wp = ev.weapon;
  if (typeof wp.enabled !== 'boolean') errors.push('The weapon on or off must be true or false.');
  wp.start_shots = num(errors, 'Starting shots', wp.start_shots, 0, 999);
  if (ev.mission === 'survive' && !hz.count) errors.push('A survive event needs at least one creature.');
  if (hz.count && hz.can_be_shot && !wp.enabled) errors.push('The hazards can be shot, but the weapon is off. Turn the weapon on, or make them unshootable.');

  checkMissions(ev, errors);

  const ck = ev.clock;
  ck.announce_every_seconds = num(errors, 'The clock announcement interval', ck.announce_every_seconds, 0, 3600);
  ck.countdown_seconds = num(errors, 'The countdown', ck.countdown_seconds, 0, 60);
  for (const k of ['start', 'end']) if (typeof ev.messages[k] !== 'string') errors.push(`The ${k} message must be text.`);
  for (const k of ['start_sound', 'end_sound']) {
    const v = ev.messages[k];
    if (T(v) && !isFile(v)) errors.push(`The ${k.replace('_', ' ')} must be a sound file name like evt_fanfare.ogg, or empty.`);
  }
  return [ev, errors];
}

// Whether a run of this event has a clock.
export function hasClock(ev) {
  return Boolean(ev.clock.on === undefined ? true : ev.clock.on) && ev.time_limit_seconds > 0;
}

// Whether a run of this event ever has creatures.
export function hasCreatures(ev) {
  const m = ev.mission;
  return ((ev.hazards || {}).count || 0) > 0 || m === 'escape'
    || (m === 'keys' && ((ev.keys || {}).more_creatures_each_room || 0) > 0);
}

const endsByCreature = (ev) => hasCreatures(ev) && ev.hazards.on_touch === 'end_run';

// With no clock, something else must be able to end a run, or it would never end.
// Returns null if it can, or the reason it cannot.
export function canEndWithoutClock(ev) {
  const m = ev.mission; const it = ev.item;
  if (['decoys', 'relay', 'follow', 'dodge', 'defend', 'bomb', 'reflex', 'chairs', 'steps', 'rhythm', 'lamps'].includes(m)) return null;
  if (m === 'whack') {
    return (ev.whack.misses_allowed || it.total || endsByCreature(ev)) ? null
      : 'With no clock, a whack-a-mole event needs a total, a number of misses allowed, or creatures whose touch ends it.';
  }
  if (m === 'sort') {
    return (ev.sort.wrong === 'end_run' || ev.item.total || endsByCreature(ev)) ? null
      : 'With no clock, a sorting event needs a total, the wrong bin to end the run, or creatures that end it.';
  }
  if (['sneak', 'rescue', 'herd', 'keys', 'fishing'].includes(m)) {
    if ((ev.item.total && m !== 'keys') || endsByCreature(ev)) return null;
    return m !== 'keys' ? 'With no clock, this event needs a set number of items in total, or creatures whose touch ends the run.'
      : 'With no clock, a key and door event needs creatures whose touch ends the run.';
  }
  if (m === 'memory') {
    return (ev.memory.wrong === 'end_run' || endsByCreature(ev)) ? null
      : 'With no clock, a memory event needs a wrong pad to end the run, or creatures whose touch ends it.';
  }
  if (m === 'hold') return endsByCreature(ev) ? null : 'With no clock, a hold event needs creatures whose touch ends the run.';
  if (m === 'pairs') return endsByCreature(ev) ? null : 'With no clock, a pairs event needs creatures whose touch ends the run: the rounds go on for ever.';
  if (m === 'escape') return endsByCreature(ev) ? null : 'With no clock, an escape event needs creatures whose touch ends the run.';
  if (m === 'order') {
    return (ev.order.wrong === 'end_run' || endsByCreature(ev)) ? null
      : 'With no clock, an in-order event needs the wrong one to end the run, or creatures whose touch ends it.';
  }
  if (m === 'hunt') {
    return (ev.hazards.respawn_seconds === 0 || endsByCreature(ev)) ? null
      : 'With no clock, a hunt needs creatures that stay down once hit (a comeback time of 0), or creatures whose touch ends the run.';
  }
  if (m === 'survive') return endsByCreature(ev) ? null : 'With no clock, a survive event needs creatures whose touch ends the run: you last as long as you can.';
  if (it.total > 0 || endsByCreature(ev)) return null;
  return 'With no clock, this event needs a set number of items in total (so the run ends when the last is found), or creatures whose touch ends the run.';
}

function checkMissions(ev, errors) {
  const m = ev.mission; const it = ev.item; const hz = ev.hazards; const wp = ev.weapon;
  if (ev.mode === 'room' && !hasClock(ev)) {
    const why = canEndWithoutClock(ev);
    if (why) errors.push(why);
    if (it.time_bonus || (m === 'hunt' && ev.hunt.time_bonus)) errors.push('A time bonus counts the seconds left on the clock, so it needs a clock.');
    if (T(ev.time_credits.enabled)) errors.push('Time credits add seconds to the clock, so they need a clock.');
    if (hz.on_touch === 'lose_time' && hz.count) errors.push('Creatures that take seconds off the clock need a clock.');
    if (m === 'order' && ev.order.wrong === 'lose_time') errors.push('Losing seconds for the wrong one needs a clock.');
  }
  const snd = (label, v) => { if (T(v) && !isFile(v)) errors.push(`${label} must be a sound file name, or empty.`); };
  const flag = (label, v) => { if (typeof v !== 'boolean') errors.push(`${label} must be true or false.`); };

  const dv = ev.deliver;
  if (!DROPOFF_PLACES.includes(dv.dropoff)) errors.push('The drop-off place must be one of: ' + DROPOFF_PLACES.join(', ') + '.');
  for (const k of ['dropoff_moves', 'drop_on_touch']) flag(`Deliver: ${k.replace('_', ' ')}`, dv[k]);
  for (const k of ['dropoff_sound', 'delivered_sound']) {
    if (T(dv[k]) && !isFile(dv[k])) errors.push(`Deliver: the ${k.replace('_', ' ')} must be a sound file name, or empty.`);
  }
  dv.carry_most = num(errors, 'Items you can carry at once', dv.carry_most, 1, 5);

  const ca = ev.catch;
  ca.speed = num(errors, 'How fast the runaways run', ca.speed, 0.2, 3.0, false);
  ca.flee_distance = num(errors, 'How close you get before they run', ca.flee_distance, 3, 90);
  flag('Whether the runaways wander', ca.wanders);

  const rl = ev.relay;
  rl.seconds_first = num(errors, 'Seconds for the first checkpoint', rl.seconds_first, 3, 600);
  rl.seconds_less_each = num(errors, 'Seconds fewer for each checkpoint', rl.seconds_less_each, 0, 60, false);
  rl.seconds_least = num(errors, 'The fewest seconds for a checkpoint', rl.seconds_least, 2, 600);
  if (rl.seconds_least > rl.seconds_first) errors.push('The fewest seconds for a checkpoint cannot be more than the seconds for the first.');

  const fo = ev.follow;
  fo.speed = num(errors, "The guide's speed", fo.speed, 0.2, 3.0, false);
  fo.near_distance = num(errors, 'How close counts as with the guide', fo.near_distance, 3, 90);
  fo.lost_seconds = num(errors, 'Seconds away from the guide before the run ends', fo.lost_seconds, 2, 120);
  fo.points_per_second = num(errors, 'Points for each second with the guide', fo.points_per_second, 0, 1000);
  flag('Whether the guide stops', fo.stops);

  const hu = ev.hunt;
  hu.time_bonus = num(errors, "The hunt's time bonus", hu.time_bonus, 0, 10000);
  hu.ammo_every_seconds = num(errors, 'How often an ammo box appears', hu.ammo_every_seconds, 0, 3600);
  hu.ammo_amount = num(errors, 'Shots in an ammo box', hu.ammo_amount, 1, 999);

  const sk = ev.seek;
  sk.pings = num(errors, 'Pings a run may use', sk.pings, 0, 999);
  sk.ping_wait = num(errors, 'Seconds between pings', sk.ping_wait, 0.0, 60.0, false);
  sk.auto_ping_seconds = num(errors, 'How often the game pings by itself', sk.auto_ping_seconds, 0, 600);
  if (T(sk.ping_sound) && !isFile(sk.ping_sound)) errors.push('The ping sound must be a sound file name, or empty.');

  const od = ev.order;
  od.first_round = num(errors, 'Items in round 1', od.first_round, 2, 12);
  od.per_round = num(errors, 'More items each round', od.per_round, 0, 5);
  od.most = num(errors, 'The most items in a round', od.most, 2, 12);
  od.note_gap = num(errors, 'The gap between notes', od.note_gap, 1, 6);
  if (!ORDER_DIRECTIONS.includes(od.direction)) errors.push('The order must be low_first or high_first.');
  if (!ORDER_WRONG.includes(od.wrong)) errors.push('What the wrong one does must be one of: ' + ORDER_WRONG.join(', ') + '.');
  od.penalty = num(errors, 'The penalty for the wrong one', od.penalty, 0, 10000);
  od.points_per_round = num(errors, 'Points for each round', od.points_per_round, 0, 100000);
  if (T(od.wrong_sound) && !isFile(od.wrong_sound)) errors.push("The wrong one's sound must be a sound file name, or empty.");

  const ex = ev.escape;
  ex.first_room = num(errors, 'Creatures in room 1', ex.first_room, 1, 10);
  ex.more_each_room = num(errors, 'More creatures each room', ex.more_each_room, 0, 5);
  ex.most = num(errors, 'The most creatures in a room', ex.most, 1, 10);
  ex.points_per_room = num(errors, 'Points for each room escaped', ex.points_per_room, 0, 100000);
  ex.exit_distance = num(errors, 'How far away the way out appears', ex.exit_distance, 6, 150);
  if (ex.exit_sound !== 'exit_morse' && !isFile(ex.exit_sound)) errors.push("The escape's way out sound must be exit_morse or a sound file name.");

  const me = ev.memory;
  me.pads = num(errors, 'Memory: pads', me.pads, 2, 8);
  me.pad_distance = num(errors, 'Memory: how far the pads are from the middle', me.pad_distance, 6, 70);
  me.first_length = num(errors, 'Memory: notes in the first tune', me.first_length, 1, 10);
  me.longest = num(errors, 'Memory: the longest tune', me.longest, 1, 30);
  me.note_gap = num(errors, 'Memory: seconds between notes', me.note_gap, 0.3, 3.0, false);
  me.penalty = num(errors, 'Memory: penalty', me.penalty, 0, 10000);
  me.points_per_round = num(errors, 'Memory: points per round', me.points_per_round, 0, 100000);
  if (!MEMORY_WRONG.includes(me.wrong)) errors.push('Memory: what a wrong pad does must be end_run or lose_points.');
  flag('Memory: whether the pads hum', me.pads_call);
  if (me.first_length > me.longest) errors.push('Memory: the first tune cannot be longer than the longest.');
  const pa = ev.pairs;
  pa.first_pairs = num(errors, 'Pairs: pairs in round 1', pa.first_pairs, 2, 10);
  pa.more_each_round = num(errors, 'Pairs: more pairs each round', pa.more_each_round, 0, 5);
  pa.most = num(errors, 'Pairs: the most pairs', pa.most, 2, 10);
  pa.note_gap = num(errors, 'Pairs: the gap between notes', pa.note_gap, 1, 6);
  pa.points_per_pair = num(errors, 'Pairs: points per pair', pa.points_per_pair, 0, 100000);
  pa.points_per_round = num(errors, 'Pairs: points per round', pa.points_per_round, 0, 100000);
  if (pa.most * pa.note_gap > 30 && it.beacon_set.length < pa.most) {
    errors.push('Pairs: that many pitched notes that far apart would not fit; lower the most pairs or the gap, or choose more item recordings.');
  }
  const de = ev.detector;
  de.slowest = num(errors, 'Detector: the slowest beeping', de.slowest, 0.3, 5.0, false);
  de.fastest = num(errors, 'Detector: the fastest beeping', de.fastest, 0.05, 2.0, false);
  de.range = num(errors, 'Detector: its range', de.range, 6, 200);
  if (de.fastest >= de.slowest) errors.push('Detector: the fastest beeping must be quicker than the slowest.');
  flag('Detector: whether it leans toward the treasure', de.directional);
  if (T(de.beep_sound) && !isFile(de.beep_sound)) errors.push('Detector: the beep must be a sound file name, or empty.');
  const dd = ev.dodge;
  dd.every_seconds = num(errors, 'Dodge: how often one falls', dd.every_seconds, 0.5, 60.0, false);
  dd.faster_each = num(errors, 'Dodge: how much sooner each comes', dd.faster_each, 0.0, 5.0, false);
  dd.least_seconds = num(errors, 'Dodge: the most often one falls', dd.least_seconds, 0.5, 60.0, false);
  dd.warning_seconds = num(errors, 'Dodge: the warning', dd.warning_seconds, 0.5, 10.0, false);
  dd.aim_distance = num(errors, 'Dodge: how near you it lands', dd.aim_distance, 0, 60);
  dd.blast_distance = num(errors, 'Dodge: how near counts as a hit', dd.blast_distance, 2, 30);
  dd.lives = num(errors, 'Dodge: lives', dd.lives, 1, 9);
  dd.points_per_dodge = num(errors, 'Dodge: points per dodge', dd.points_per_dodge, 0, 10000);
  for (const k of ['falling_sound', 'landing_sound']) {
    if (T(dd[k]) && !isFile(dd[k])) errors.push(`Dodge: the ${k.replace('_', ' ')} must be a sound file name, or empty.`);
  }
  if (dd.least_seconds > dd.every_seconds) errors.push('Dodge: the most often one falls cannot be slower than how often the first falls.');
  const df = ev.defend;
  df.treasure_lives = num(errors, "Defend: the treasure's lives", df.treasure_lives, 1, 20);
  df.respawn_seconds = num(errors, 'Defend: seconds before a creature comes back', df.respawn_seconds, 0, 600);
  df.faster_each = num(errors, 'Defend: how much faster each comes back', df.faster_each, 0.0, 1.0, false);
  if (T(df.treasure_sound) && !isFile(df.treasure_sound)) errors.push("Defend: the treasure's sound must be a sound file name, or empty.");
  const ho = ev.hold;
  ho.radius = num(errors, 'Hold: how big the spot is', ho.radius, 3, 60);
  ho.move_seconds = num(errors, 'Hold: how often the spot moves', ho.move_seconds, 2, 600);
  ho.points_per_second = num(errors, 'Hold: points per second', ho.points_per_second, 0, 1000);
  flag('Hold: whether a chime warns of a move', ho.warn_before_move);

  const sn = ev.sneak;
  sn.hearing = num(errors, 'Sneak: how far the guard hears', sn.hearing, 3, 90);
  sn.noise_per_step = num(errors, 'Sneak: the noise of a step', sn.noise_per_step, 0.01, 1.0, false);
  sn.quiet_per_second = num(errors, 'Sneak: how fast the noise dies away', sn.quiet_per_second, 0.0, 1.0, false);
  sn.awake_seconds = num(errors, 'Sneak: how long the guard stays awake', sn.awake_seconds, 1, 600);
  snd('Sneak: the snoring sound', sn.snore_sound);
  const bo = ev.bomb;
  bo.fuse_seconds = num(errors, 'Defuse: the first fuse', bo.fuse_seconds, 3, 600);
  bo.shorter_each = num(errors, 'Defuse: how much shorter each fuse', bo.shorter_each, 0.0, 60.0, false);
  bo.shortest = num(errors, 'Defuse: the shortest fuse', bo.shortest, 2, 600);
  bo.lives = num(errors, 'Defuse: lives', bo.lives, 1, 9);
  if (!BOMB_FUSE_STARTS.includes(bo.fuse_starts)) errors.push('Defuse: when the fuse starts must be appears or picked_up.');
  if (!DROPOFF_PLACES.includes(bo.safe_place)) errors.push('Defuse: the safe spot must be one of: ' + DROPOFF_PLACES.join(', ') + '.');
  snd("Defuse: the safe spot's sound", bo.safe_sound);
  snd('Defuse: the bang', bo.bang_sound);
  const re = ev.rescue;
  re.follow_speed = num(errors, 'Rescue: how fast a friend follows', re.follow_speed, 0.5, 6.0, false);
  re.lose_distance = num(errors, 'Rescue: how far before a friend is left behind', re.lose_distance, 6, 120);
  if (!DROPOFF_PLACES.includes(re.home)) errors.push('Rescue: home must be one of: ' + DROPOFF_PLACES.join(', ') + '.');
  snd("Rescue: home's sound", re.home_sound);
  const rf = ev.reflex;
  if (!REFLEX_DIRECTIONS.includes(rf.directions)) errors.push('Reflex: the directions must be four or two.');
  rf.window_seconds = num(errors, 'Reflex: time to answer', rf.window_seconds, 0.3, 10.0, false);
  rf.faster_each = num(errors, 'Reflex: how much less time each', rf.faster_each, 0.0, 1.0, false);
  rf.shortest = num(errors, 'Reflex: the least time to answer', rf.shortest, 0.2, 10.0, false);
  rf.gap_seconds = num(errors, 'Reflex: the silence between sounds', rf.gap_seconds, 0.2, 10.0, false);
  rf.lives = num(errors, 'Reflex: lives', rf.lives, 1, 9);
  snd('Reflex: the cue sound', rf.cue_sound);
  const ch = ev.chairs;
  snd('Musical chairs: the music', ch.music_sound);
  ch.music_shortest = num(errors, 'Musical chairs: the shortest music', ch.music_shortest, 1, 120);
  ch.music_longest = num(errors, 'Musical chairs: the longest music', ch.music_longest, 1, 300);
  if (ch.music_shortest > ch.music_longest) errors.push('Musical chairs: the shortest music cannot be longer than the longest.');
  ch.chairs = num(errors, 'Musical chairs: chairs in round 1', ch.chairs, 1, 8);
  ch.seconds_first = num(errors, 'Musical chairs: seconds to reach a chair', ch.seconds_first, 1.0, 60.0, false);
  ch.less_each = num(errors, 'Musical chairs: how much less time each round', ch.less_each, 0.0, 10.0, false);
  ch.shortest = num(errors, 'Musical chairs: the least time', ch.shortest, 0.5, 60.0, false);
  ch.chair_distance = num(errors, 'Musical chairs: how far away the chairs are', ch.chair_distance, 3, 120);
  ch.points_per_round = num(errors, 'Musical chairs: points per round', ch.points_per_round, 0, 100000);
  const fi = ev.fishing;
  fi.cast_distance = num(errors, 'Fishing: how far a cast reaches', fi.cast_distance, 6, 150);
  fi.fish_speed = num(errors, 'Fishing: how fast the fish swim', fi.fish_speed, 0.0, 3.0, false);
  fi.cast_wait = num(errors, 'Fishing: seconds between casts', fi.cast_wait, 0.0, 10.0, false);
  fi.aim = num(errors, 'Fishing: how nearly in front a fish must be', fi.aim, 0.1, 0.9, false);
  snd('Fishing: the cast', fi.cast_sound);
  const st = ev.steps;
  st.start = num(errors, 'Step limit: steps to start with', st.start, 1, 10000);
  st.per_item = num(errors, 'Step limit: steps each item gives', st.per_item, 0, 1000);
  st.warn_at = num(errors, 'Step limit: when the warning ticks start', st.warn_at, 0, 100);
  const ke = ev.keys;
  if (ke.door_sound !== 'exit_morse') snd("Key and door: the door's sound", ke.door_sound);
  snd("Key and door: the key's sound", ke.key_sound);
  ke.door_distance = num(errors, 'Key and door: how far the door is from the key', ke.door_distance, 6, 150);
  ke.points_per_room = num(errors, 'Key and door: points per room', ke.points_per_room, 0, 100000);
  ke.more_creatures_each_room = num(errors, 'Key and door: more creatures each room', ke.more_creatures_each_room, 0, 5);
  const wh = ev.whack;
  wh.every_seconds = num(errors, 'Whack-a-mole: how often one pops up', wh.every_seconds, 0.3, 30.0, false);
  wh.up_seconds = num(errors, 'Whack-a-mole: how long one stays up', wh.up_seconds, 0.5, 30.0, false);
  wh.less_each = num(errors, 'Whack-a-mole: how much less each', wh.less_each, 0.0, 5.0, false);
  wh.shortest = num(errors, 'Whack-a-mole: the shortest time up', wh.shortest, 0.3, 30.0, false);
  wh.near = num(errors, 'Whack-a-mole: how near you they pop up', wh.near, 3, 90);
  wh.misses_allowed = num(errors, 'Whack-a-mole: misses allowed', wh.misses_allowed, 0, 100);
  snd('Whack-a-mole: the hiding sound', wh.hide_sound);
  const he = ev.herd;
  if (!DROPOFF_PLACES.includes(he.pen)) errors.push('Herding: the pen must be one of: ' + DROPOFF_PLACES.join(', ') + '.');
  he.pen_radius = num(errors, 'Herding: how big the pen is', he.pen_radius, 3, 60);
  snd("Herding: the pen's sound", he.pen_sound);
  he.speed = num(errors, 'Herding: how fast they run', he.speed, 0.2, 3.0, false);
  he.flee_distance = num(errors, 'Herding: how near before they run', he.flee_distance, 3, 90);
  const rh = ev.rhythm;
  rh.beats_per_minute = num(errors, 'Rhythm: beats a minute', rh.beats_per_minute, 20, 240);
  rh.faster_every = num(errors, 'Rhythm: beats between speed-ups', rh.faster_every, 0, 1000);
  rh.faster_by = num(errors, 'Rhythm: how much faster', rh.faster_by, 0, 60);
  rh.fastest = num(errors, 'Rhythm: the fastest', rh.fastest, 20, 300);
  rh.window = num(errors, 'Rhythm: how near the beat counts', rh.window, 0.03, 0.5, false);
  rh.misses_allowed = num(errors, 'Rhythm: misses allowed', rh.misses_allowed, 1, 100);
  snd('Rhythm: the beat', rh.beat_sound);
  const so = ev.sort;
  if (!SORT_WRONG.includes(so.wrong)) errors.push('Sorting: what the wrong bin does must be end_run or lose_points.');
  so.penalty = num(errors, 'Sorting: the penalty', so.penalty, 0, 10000);
  const la = ev.lamps;
  la.lamps = num(errors, 'Lamplighter: lamps', la.lamps, 1, 8);
  la.burn_seconds = num(errors, 'Lamplighter: how long a lamp burns', la.burn_seconds, 2, 600);
  la.fade_seconds = num(errors, 'Lamplighter: how long it fades', la.fade_seconds, 1, 120);
  la.shorter_each = num(errors, 'Lamplighter: how much shorter each burn', la.shorter_each, 0.0, 30.0, false);
  la.shortest = num(errors, 'Lamplighter: the shortest burn', la.shortest, 1, 600);
  la.out_allowed = num(errors, 'Lamplighter: lamps allowed out', la.out_allowed, 0, 7);
  snd('Lamplighter: the lighting sound', la.light_sound);

  if (ev.mode !== 'room') return;
  if (m === 'sneak' && !hz.count) errors.push('A sneak event needs at least one creature: the guard.');
  if (m === 'sort' && !(it.beacon_set.length >= 2 && it.beacon_set.length <= 4)) errors.push('A sorting event needs 2 to 4 item sounds, one for each kind of item and its bin.');
  if (m === 'herd' && it.at_once < 1) errors.push('A herding event needs at least one item out at a time.');
  if (m === 'lamps' && la.out_allowed >= la.lamps) errors.push('Lamplighter: fewer lamps may go out than there are lamps.');
  if (m === 'defend') {
    if (!hz.count) errors.push('A defend event needs at least one creature.');
    if (!hz.can_be_shot || !wp.enabled) errors.push('A defend event needs the weapon on, and creatures that can be shot.');
  }
  if (['deliver', 'catch', 'seek', 'order'].includes(m) && it.at_once < 1 && m !== 'order') errors.push('This mission needs at least one item out at a time.');
  if (m === 'hunt') {
    if (!hz.count) errors.push('A hunt needs at least one creature.');
    if (!hz.can_be_shot || !wp.enabled) errors.push('A hunt needs the weapon on, and creatures that can be shot.');
  }
  if (m === 'seek' && wp.enabled) errors.push('In a silent search Space sends the ping, so the weapon must be off.');
  if (['order', 'decoys'].includes(m) && it.bonus_chance) errors.push('Bonus items are not used in this mission; set their chance to 0.');
}

// Every recording an event asks for, by file name.
export function soundFiles(event) {
  const g = (sec, k) => (event[sec] || {})[k];
  const out = [...(event.item.beacon_set || []), ...(event.ambience_zones || [])];
  if ((g('decoys', 'exit_sound') || 'exit_morse') !== 'exit_morse') out.push(event.decoys.exit_sound);
  if (g('item', 'bonus_chance') && event.item.bonus_file) out.push(event.item.bonus_file);
  if (g('decoys', 'dark_exit_sound')) out.push(event.decoys.dark_exit_sound);
  for (const [sec, keys] of [['sneak', ['snore_sound']], ['bomb', ['safe_sound', 'bang_sound']], ['rescue', ['home_sound']],
    ['reflex', ['cue_sound']], ['chairs', ['music_sound']], ['fishing', ['cast_sound']], ['keys', ['key_sound']],
    ['whack', ['hide_sound']], ['herd', ['pen_sound']], ['rhythm', ['beat_sound']], ['lamps', ['light_sound']]]) {
    for (const k of keys) out.push(g(sec, k));
  }
  if ((g('keys', 'door_sound') || 'exit_morse') !== 'exit_morse') out.push(event.keys.door_sound);
  out.push(g('detector', 'beep_sound'), g('dodge', 'falling_sound'), g('dodge', 'landing_sound'), g('defend', 'treasure_sound'));
  out.push(g('deliver', 'dropoff_sound'), g('deliver', 'delivered_sound'), g('seek', 'ping_sound'), g('order', 'wrong_sound'));
  if ((g('escape', 'exit_sound') || 'exit_morse') !== 'exit_morse') out.push(event.escape.exit_sound);
  out.push(event.item.beacon_file, event.item.pickup_file, event.messages.start_sound, event.messages.end_sound);
  if (hasCreatures(event) && !HAZARD_SOUNDS.includes(event.hazards.sound)) out.push(event.hazards.sound);
  if (!AMBIENCES.includes(event.ambience)) out.push(event.ambience);
  // Python's truth test: an empty list or table left in a setting is dropped too.
  return out.filter((f) => f && !(typeof f === 'object' && !Object.keys(f).length));
}
