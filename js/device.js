// What kind of device this is. The web version is for phones and tablets
// (iPhone, iPad, Android phones and tablets) and, since web version 1.0.3, for
// Chromebooks, Macs and Linux computers, played with the keyboard. Windows
// computers are refused: Endless Labyrinth already has a full Windows version.
//
// Apple devices (web 1.1.0): an iPad's Safari says it is a Mac, and an iPhone
// can say so too (Request Desktop Website), while an iPad can say "iPad" (Request
// Mobile Website) or, in some browsers, "iPhone". So an Apple touch device is told
// from the others by its touch screen, and an iPhone is told from an iPad by the
// size of its screen, which no browser setting changes: the shorter side of an
// iPhone's screen is under 600 CSS pixels (the largest is 440), an iPad's is 744
// or more. Before 1.1.0 the words alone decided, and an iPhone could be called an
// iPad and an iPad a phone. A Chromebook says CrOS, even with a touch screen.

const TABLET_SHORT_SIDE = 600;   // CSS pixels: a tablet's shorter screen side is at least this

function shortSide() {
  if (typeof screen === 'undefined' || !screen) return 0;
  const w = Number(screen.width) || 0, h = Number(screen.height) || 0;
  return w && h ? Math.min(w, h) : 0;
}

function touchPoints() {
  return (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints)) || 0;
}

// An iPhone or an iPad, whatever its browser calls itself; null for anything else.
export function appleTouchKind(ua = navigator.userAgent || '', points = touchPoints(), side = shortSide()) {
  const saysApple = /iPad|iPhone|iPod/.test(ua);
  const saysMac = /Macintosh|Mac OS X/.test(ua);
  if (!saysApple && !(saysMac && points > 1)) return null;
  if (/Android|CrOS|Windows/.test(ua)) return null;   // a phone that copies Apple's words into its own
  if (side) return side < TABLET_SHORT_SIDE ? 'iphone' : 'ipad';
  // No screen to measure (the tests' Node side): go by the words.
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  return 'ipad';
}

export function deviceKind() {
  const ua = navigator.userAgent || '';
  if (/CrOS/.test(ua)) return 'chromebook';
  const apple = appleTouchKind(ua);
  if (apple) return apple;
  if (/Android/.test(ua)) {
    return shortSide() >= TABLET_SHORT_SIDE ? 'android-tablet' : 'android-phone';
  }
  // Chrome (since version 120) and Samsung Internet open sites on a big Android
  // tablet as a desktop: a Linux user agent with no "Android" in it. Such a tablet
  // has only a touch screen, while a Linux computer also has a mouse or touchpad.
  if (/Linux/.test(ua) && touchPoints() > 0 && window.matchMedia
      && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) return 'android-tablet';
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  return 'linux';
}

// The computers the web version plays on, with the keyboard.
export function isComputer(kind) { return kind === 'chromebook' || kind === 'mac' || kind === 'linux'; }

// Whether this page is played with the keyboard's wording: a Chromebook, Mac or
// Linux computer.
export function keyboardDevice() {
  if (typeof window === 'undefined' || typeof location === 'undefined') return false;
  // The developer's tests (play.html?desktop=1 on localhost) play with the phone's
  // wording, as they always have.
  if (allowComputer()) return false;
  return isComputer(deviceKind());
}

export function isApple(kind) { return kind === 'ipad' || kind === 'iphone'; }

// The screen reader that reads the website on this kind of device. (The game
// itself speaks with the device's own voice, so the screen reader goes off while
// playing.)
export function screenReaderName(kind) {
  if (isApple(kind)) return 'VoiceOver';
  if (kind.startsWith('android')) return 'TalkBack';
  if (kind === 'mac') return 'VoiceOver';
  if (kind === 'chromebook') return 'ChromeVox';
  if (kind === 'windows') return 'your screen reader';
  if (kind === 'linux') return 'Orca';
  return 'your screen reader';
}

export function deviceWord(kind) {
  return { ipad: 'iPad', iphone: 'iPhone', 'android-tablet': 'tablet', 'android-phone': 'phone', chromebook: 'Chromebook', mac: 'Mac', linux: 'computer', windows: 'computer', touch: 'device' }[kind] || 'device';
}

// For the developer's own tests only: play.html?desktop=1 runs the game on a
// computer with a keyboard, and only when the game is served from the
// developer's machine (localhost), never on the website.
export function allowComputer() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return local && new URLSearchParams(location.search).has('desktop');
}
