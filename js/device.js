// What kind of device this is. The web version is for phones and tablets: a
// computer is pointed to the Windows game instead.
//
// An iPad's Safari says it is a Mac, so an iPad is recognised by its touch
// screen, not by its name.

export function deviceKind() {
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : touch;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) {
    const small = Math.min(screen.width, screen.height);
    return small >= 600 ? 'android-tablet' : 'android-phone';
  }
  if (touch && coarse) return 'touch';
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

// For testing on a computer: play.html?desktop=1 lets the game run with a keyboard.
export function allowComputer() {
  return new URLSearchParams(location.search).has('desktop');
}
