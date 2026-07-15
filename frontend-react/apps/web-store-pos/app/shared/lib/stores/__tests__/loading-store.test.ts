import { beforeEach, describe, expect, it } from 'vitest';
import { useLoadingStore } from '../loading-store';

// Mirrors Angular's LoadingService (frontend/src/app/_services/loading.service.ts:5-27):
// a request-count BehaviorSubject. start() increments and always emits true;
// stop() decrements with Math.max(0, count-1) and emits false only when the
// counter reaches 0 — so overlapping requests never let the spinner flicker
// off while a sibling request is still in flight.
describe('useLoadingStore', () => {
  beforeEach(() => {
    useLoadingStore.setState({ count: 0, isLoading: false });
  });

  it('starts with isLoading false (Angular LoadingService count=0 default)', () => {
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  it('start() sets isLoading true (Angular loading.service.ts:14-18)', () => {
    useLoadingStore.getState().start();

    expect(useLoadingStore.getState().isLoading).toBe(true);
  });

  it('stop() after a single start() sets isLoading back to false', () => {
    useLoadingStore.getState().start();
    useLoadingStore.getState().stop();

    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  it('keeps isLoading true while a sibling request is still in flight (counter semantics)', () => {
    useLoadingStore.getState().start();
    useLoadingStore.getState().start();
    useLoadingStore.getState().stop();

    expect(useLoadingStore.getState().isLoading).toBe(true);
  });

  it('only emits isLoading=false once the count returns to 0 (Angular loading.service.ts:20-26)', () => {
    useLoadingStore.getState().start();
    useLoadingStore.getState().start();
    useLoadingStore.getState().stop();
    useLoadingStore.getState().stop();

    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  it('clamps the counter at 0 — an extra stop() never goes negative or throws (Angular Math.max(0, count-1))', () => {
    expect(() => useLoadingStore.getState().stop()).not.toThrow();

    const state = useLoadingStore.getState();
    expect(state.count).toBe(0);
    expect(state.isLoading).toBe(false);
  });
});
