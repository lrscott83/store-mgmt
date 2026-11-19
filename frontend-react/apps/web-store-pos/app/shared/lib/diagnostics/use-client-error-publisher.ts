import { useEffect } from 'react';
import { StorageService } from '~/shared/lib/auth/storage-service';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import {
  CLIENT_ERROR_PUBLISH_INTERVAL_MS,
  publishClientErrorLogs,
} from './client-error-publisher';

/**
 * Trigger for the POS error publisher (pos-client-error-logs S2/S3): publishes
 * the buffered errors on mount, every time connectivity flips back to online,
 * and on a bounded interval while the device stays online.
 *
 * Mounted once from `root.tsx`, next to the other trackers. Two gates come from
 * the PERSISTED session (`StorageService`) and are re-read on every run — not
 * from the auth store — so this module stays a leaf of the diagnostics tree:
 * `root.tsx`'s own test suite stubs the auth store down to its redirect
 * functions, and a `useAuthStore` import here would drag the whole store into
 * that graph. Consequence: a session created mid-interval is picked up on the
 * next run (at most one interval later), which is exactly the "next session"
 * semantics of S3.
 *
 * Offline and session-less states are no-ops: the entries stay buffered and go
 * out on the next run that has both. The heavy lifting (cursor, chunking, never
 * throwing) lives in `client-error-publisher.ts`.
 */
export function useClientErrorPublisher(): void {
  const online = useOnlineStatus();

  useEffect(() => {
    if (!online) return;

    const publish = () => {
      const authenticated = StorageService.getTokenFromLocalStorage() !== null;
      void publishClientErrorLogs({
        online,
        authenticated,
        storeId: StorageService.getCurrentUser()?.selectedStoreId ?? null,
      });
    };

    publish();
    const timer = setInterval(publish, CLIENT_ERROR_PUBLISH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [online]);
}
