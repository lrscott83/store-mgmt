import { create } from 'zustand';

// React port of Angular's LoadingService (frontend/src/app/_services/loading.service.ts:5-27):
// a request-count store. start() increments and always sets isLoading true;
// stop() decrements with Math.max(0, count-1) and only sets isLoading false
// once the counter returns to 0 — so overlapping in-flight requests can never
// let the overlay flicker off while a sibling request is still pending.
// Framework-agnostic (no react-router import), same idiom as auth-store.ts.
interface LoadingState {
  count: number;
  isLoading: boolean;
  start: () => void;
  stop: () => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  count: 0,
  isLoading: false,

  start: () => {
    set((state) => {
      const count = state.count + 1;
      return { count, isLoading: true };
    });
  },

  stop: () => {
    set((state) => {
      const count = Math.max(0, state.count - 1);
      return { count, isLoading: count > 0 };
    });
  },
}));
