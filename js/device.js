// What kind of device this is. The web version is for phones and tablets
// (iPhone, iPad, Android phones and tablets) and, since web version 1.0.3, for
// Chromebooks, Macs and Linux computers, played with the keyboard. Windows
// computers are refused: Endless Labyrinth already has a full Windows version.
//
// An iPad's Safari says it is a Mac, so an iPad is recognised by its touch
// screen (a Mac has none). A Chromebook says CrOS, even with a touch screen.

export function deviceKind() {
  const ua = navigator.userAgent || '';
  if (/CrOS/.test(ua)) return 'chromebook';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) {
    const small = Math.min(screen.width, screen.height);
    return small >= 600 ? 'android-tablet' : 'android-phone';
  }
  // Chrome (since version 120) and Samsung Internet open sites on a big Android
  // tablet as a desktop: a Linux user agent with no "Android" in it. Such a tablet
  // has only a touch screen, while a Linux computer also has a mouse or touchpad.
  if (/Linux/.test(ua) && navigator.maxTouchPoints > 0 && window.matchMedia
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

export function screenReaderName(kind) {
  if (isApple(kind)) return 'VoiceOver';
  if (kind.startsWith('android')) return 'TalkBack';
  if (kind === 'mac') return 'VoiceOver';
  if (kind === 'chromebook') return 'ChromeVox';
  return 'your screen reader';
}

export function deviceWord(kind) {
  return { ipad: 'iPad', iphone: 'iPhone', 'android-tablet': 'tablet', 'android-phone': 'phone', chromebook: 'Chromebook', mac: 'Mac', linux: 'computer', touch: 'device' }[kind] || 'device';
}

// For the developer's own tests only: play.html?desktop=1 runs the game on a
// computer with a keyboard, and only when the game is served from the
// developer's machine (localhost), never on the website.
export function allowComputer() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return local && new URLSearchParams(location.search).has('desktop');
}
