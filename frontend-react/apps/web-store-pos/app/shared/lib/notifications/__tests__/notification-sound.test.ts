import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The module caches its AudioContext and a "last beep" timestamp at module
 * scope, so every test gets a fresh copy — otherwise the first test's context
 * and timestamp would decide the outcome of the next one.
 */
async function loadSoundModule() {
  vi.resetModules();
  return import('../notification-sound');
}

interface FakeAudioContextOptions {
  initialState?: AudioContextState;
  resumeResolvesTo?: AudioContextState;
  resumeThrows?: boolean;
  createOscillatorThrows?: boolean;
}

interface FakeAudioContext {
  ctor: unknown;
  oscillators: FakeOscillator[];
  gainNodes: FakeGain[];
  /** How many contexts the module actually constructed. */
  constructions: () => number;
  resume: () => Promise<void>;
}

interface FakeParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

interface FakeOscillator {
  type: string;
  frequency: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: FakeParam;
  connect: ReturnType<typeof vi.fn>;
}

/** Audio-context-shaped window, plus the Safari spelling that is not in lib.dom. */
interface AudioWindow extends Window {
  AudioContext?: unknown;
  webkitAudioContext?: unknown;
}

function installFakeAudioContext(options: FakeAudioContextOptions = {}): FakeAudioContext {
  const oscillators: FakeOscillator[] = [];
  const gainNodes: FakeGain[] = [];
  let constructions = 0;
  let state = options.initialState ?? 'running';

  const param = (value: number): FakeParam => ({
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });

  class FakeAudioContext {
    currentTime = 0;
    destination = {};

    constructor() {
      constructions += 1;
    }

    get state() {
      return state;
    }

    resume = vi.fn(() => {
      if (options.resumeThrows) return Promise.reject(new Error('resume not allowed here'));
      state = options.resumeResolvesTo ?? 'running';
      return Promise.resolve();
    });

    createOscillator() {
      if (options.createOscillatorThrows) throw new Error('no oscillator here');
      const oscillator: FakeOscillator = {
        // Deliberately NOT the values the module is expected to set, so a test
        // that forgets to configure the tone fails instead of passing by luck.
        type: 'square',
        frequency: param(440),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }

    createGain() {
      const gain: FakeGain = { gain: param(1), connect: vi.fn() };
      gainNodes.push(gain);
      return gain;
    }
  }

  const scope = window as AudioWindow;
  scope.AudioContext = FakeAudioContext;
  scope.webkitAudioContext = undefined;

  return {
    ctor: FakeAudioContext,
    oscillators,
    gainNodes,
    constructions: () => constructions,
    resume: () => new FakeAudioContext().resume(),
  };
}

function removeAudioContext() {
  const scope = window as AudioWindow;
  scope.AudioContext = undefined;
  scope.webkitAudioContext = undefined;
}

describe('playNotificationSound', () => {
  const originalAudioContext = (window as AudioWindow).AudioContext;
  const originalWebkit = (window as AudioWindow).webkitAudioContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const scope = window as AudioWindow;
    scope.AudioContext = originalAudioContext;
    scope.webkitAudioContext = originalWebkit;
  });

  it('plays a short quiet sine beep through an oscillator and a gain envelope', async () => {
    const { playNotificationSound } = await loadSoundModule();
    const { oscillators, gainNodes } = installFakeAudioContext();

    const played = await playNotificationSound();

    expect(played).toBe(true);
    expect(oscillators).toHaveLength(1);
    expect(gainNodes).toHaveLength(1);
    // A sine tone at 880 Hz, not the fake's defaults — a square wave at 440 Hz
    // would be a harsh low beep, which is not an arrival cue.
    expect(oscillators[0].type).toBe('sine');
    expect(oscillators[0].frequency.value).toBe(880);
    // The envelope opens at zero and peaks low: a gain that starts at full amplitude
    // clicks audibly, and a notification must not out-shout the page.
    expect(gainNodes[0].gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(gainNodes[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.12, 0.01);
    // Ramps back down to silence rather than cutting out — an abrupt stop clicks too.
    expect(gainNodes[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.18);
    expect(oscillators[0].start).toHaveBeenCalledWith(0);
    // It stops on its own: a beep that never ends is a hang, not a cue.
    expect(oscillators[0].stop).toHaveBeenCalledWith(0.18);
  });

  it('reuses one AudioContext across beeps instead of constructing one per call', async () => {
    const { playNotificationSound } = await loadSoundModule();
    const { oscillators, constructions } = installFakeAudioContext();
    // Past the minimum interval between beeps, so the second call really plays
    // and the assertion is about context reuse rather than the interval guard.
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    await playNotificationSound();
    vi.spyOn(Date, 'now').mockReturnValue(now + 5_000);
    await playNotificationSound();

    expect(oscillators).toHaveLength(2);
    expect(constructions()).toBe(1);
  });

  it('does not throw and reports false when the browser has no AudioContext', async () => {
    const { playNotificationSound } = await loadSoundModule();
    removeAudioContext();

    await expect(playNotificationSound()).resolves.toBe(false);
  });

  it('uses the webkitAudioContext spelling when AudioContext is absent', async () => {
    const { playNotificationSound } = await loadSoundModule();
    const { ctor, constructions } = installFakeAudioContext();
    const scope = window as AudioWindow;
    scope.AudioContext = undefined;
    scope.webkitAudioContext = ctor;

    await expect(playNotificationSound()).resolves.toBe(true);
    expect(constructions()).toBe(1);
  });

  it('does not throw and reports false when the context is still suspended after resuming', async () => {
    const { playNotificationSound } = await loadSoundModule();
    // The autoplay policy: no user gesture yet, so the context stays suspended.
    // The beep is dropped rather than queued into a page nobody is looking at.
    const { oscillators } = installFakeAudioContext({
      initialState: 'suspended',
      resumeResolvesTo: 'suspended',
    });

    await expect(playNotificationSound()).resolves.toBe(false);
    expect(oscillators).toHaveLength(0);
  });

  it('does not throw and reports false when resuming itself throws', async () => {
    const { playNotificationSound } = await loadSoundModule();
    installFakeAudioContext({ initialState: 'suspended', resumeThrows: true });

    await expect(playNotificationSound()).resolves.toBe(false);
  });

  it('does not throw when building the oscillator itself fails', async () => {
    const { playNotificationSound } = await loadSoundModule();
    installFakeAudioContext({ createOscillatorThrows: true });

    await expect(playNotificationSound()).resolves.toBe(false);
  });

  it('does not fire twice when called rapidly', async () => {
    const { playNotificationSound } = await loadSoundModule();
    const { oscillators } = installFakeAudioContext();

    const [first, second] = await Promise.all([
      playNotificationSound(),
      playNotificationSound(),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(oscillators).toHaveLength(1);
  });
});