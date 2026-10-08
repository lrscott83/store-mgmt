/**
 * In-app arrival sound, synthesized with the Web Audio API.
 *
 * Why SYNTHESIZED and not a file: a `.mp3`/`.ogg` would add a binary asset to
 * the repository for 200 ms of sine tone, and its decoding is asynchronous,
 * which makes it untestable without an audio decoder. An OscillatorNode plus
 * a GainNode envelope is a few lines, deterministic, and needs no asset.
 *
 * This app renders on the server, so NOTHING here may touch `window`,
 * `AudioContext` or `webkitAudioContext` at module scope — every access is lazy
 * and guarded. The browser autoplay policy also keeps an AudioContext
 * `suspended` until the user has interacted with the page, and re-asking is not
 * possible from here: the context is resumed if it can be, and if it still
 * cannot play, the beep is simply dropped. Sound is a courtesy layer on top of
 * a notification the user can already see in the bell, so it degrades to
 * silence instead of ever throwing or leaving a rejected promise unhandled.
 */

/** Short and quiet: an arrival cue, not an alarm. */
const BEEP_FREQUENCY_HZ = 880;
const BEEP_DURATION_S = 0.18;
const BEEP_PEAK_GAIN = 0.12;

/**
 * Minimum gap between two beeps. Three owners registering at once must not
 * overlap into a loud chord, and a rapid re-render must not machine-gun. The
 * check is on a module-level timestamp rather than a "currently playing" flag
 * because the beep is shorter than the gap anyway — overlapping is impossible.
 */
const MIN_INTERVAL_MS = 400;

/**
 * One ask per module lifetime, mirroring `notification-permission.ts`. Creating
 * an AudioContext per beep is wasteful, and the browser caps how many can be
 * live at once, so the context is cached. It is never closed on purpose: the
 * bell is mounted for the whole session, and closing a context that another
 * caller may still be holding would be a worse bug than a parked one.
 *
 * This is module state, not injectable state: a test controls it by installing
 * its own `window.AudioContext` before the first call and by resetting the
 * module between files (`vi.resetModules`), so it can never leak into runtime.
 */
let cachedContext: AudioContext | null = null;
let lastBeepAt = 0;

/**
 * `AudioContext` is declared by `lib.dom` as a global, not as a member of the
 * `Window` interface, and `webkitAudioContext` (the Safari spelling) is not
 * declared at all — hence the explicit window shape rather than a bare cast.
 */
interface AudioWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Resolves the AudioContext constructor or null when it does not exist — server
 * render, an old browser, or a locked-down one.
 */
function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const scope = window as AudioWindow;
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

async function getContext(): Promise<AudioContext | null> {
  if (cachedContext) return cachedContext;

  const ctor = getAudioContextConstructor();
  if (!ctor) return null;

  try {
    cachedContext = new ctor();
  } catch {
    // A browser that refuses to construct one is not an error worth surfacing.
    return null;
  }

  return cachedContext;
}

/**
 * Plays one short beep. Returns whether the sound was actually scheduled, so a
 * caller (or a test) can tell "played" from "silently dropped" — and never
 * throws, whatever the browser does.
 */
export async function playNotificationSound(): Promise<boolean> {
  try {
    const now = Date.now();
    if (now - lastBeepAt < MIN_INTERVAL_MS) return false;
    lastBeepAt = now;

    const context = await getContext();
    if (!context) return false;

    // Autoplay policy: a context starts suspended until a real user gesture
    // unlocks the page. `resume()` is only ever legal from a gesture, so a
    // rejection here is expected rather than exceptional.
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return false;
      }
      // Still suspended: the user has not interacted yet. Drop the beep rather
      // than queue it into a page that may not be looked at for hours.
      if (context.state === 'suspended') return false;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = BEEP_FREQUENCY_HZ;

    // Ramp up and back down instead of starting at full amplitude: a gain that
    // jumps straight to its peak clicks audibly on the attack.
    const nowTime = context.currentTime;
    gain.gain.setValueAtTime(0, nowTime);
    gain.gain.linearRampToValueAtTime(BEEP_PEAK_GAIN, nowTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, nowTime + BEEP_DURATION_S);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(nowTime);
    oscillator.stop(nowTime + BEEP_DURATION_S);

    return true;
  } catch {
    // Never a broken header over a courtesy sound.
    return false;
  }
}