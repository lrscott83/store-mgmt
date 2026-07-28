import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIdleTimer } from '../idle-timeout';

describe('createIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onIdle after the timeout elapses with no activity', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle, 1000);
    timer.start();

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resets the countdown when notifyActivity() is called', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle, 1000);
    timer.start();

    vi.advanceTimersByTime(900);
    timer.notifyActivity();
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not fire after stop()', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle, 1000);
    timer.start();
    timer.stop();

    vi.advanceTimersByTime(2000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('defaults to a 1-hour (3_600_000ms) timeout', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle);
    timer.start();

    vi.advanceTimersByTime(3_600_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
