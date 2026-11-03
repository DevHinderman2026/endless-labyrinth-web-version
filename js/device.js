// What kind of device this is. The web version is for phones and tablets
// only: iPhone, iPad, and Android phones and tablets. Every computer is refused,
// touch screen or not: Windows, Mac, Linux and Chromebooks. Endless Labyrinth
// already has a full Windows version for computers.
//
// An iPad's Safari says it is a Mac, so an iPad is recognised by its touch
// screen (a Mac has none). A Chromebook says CrOS, even with a touch screen.

export function deviceKind() {
  const ua = navigator.userAgent || '';
  if (/CrOS/.test(ua)) return 'computer';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) {
    const small = Math.min(screen.width, screen.height);
    return small >= 600 ? 'android-tablet' : 'android-phone';
  }
  return 'computer';
}

export function isApple(kind) { return kind === 'ipad' || kind === 'iphone'; }

export function screenReaderName(kind) {
  if (isApple(kind)) return 'VoiceOver';
  if (kind.startsWith('android')) return 'TalkBack';
  return 'your screen reader';
}

export function deviceWord(kind) {
  return { ipad: 'iPad', iphone: 'iPhone', 'android-tablet': 'tablet', 'android-phone': 'phone', touch: 'device' }[kind] || 'device';
}

// For the developer's own tests only: play.html?desktop=1 runs the game on a
// computer with a keyboard, and only when the game is served from the
// developer's machine (localhost), never on the website.
export function allowComputer() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return local && new URLSearchParams(location.search).has('desktop');
}
