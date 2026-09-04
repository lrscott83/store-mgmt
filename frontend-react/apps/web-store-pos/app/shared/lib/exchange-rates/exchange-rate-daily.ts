import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';
import { fromLocalDayKey, toLocalDayKey } from '../date-utils';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/**
 * The register's list runs from today down to the FIRST day the store owner
 * authenticated on this device (daily-exchange-rate). The anchor is stamped
 * once — by `ensureExchangeRateDailyRecords` on the owner's first login — and
 * read from here by the view and by the backfill entry points.
 *
 * When no anchor exists yet (e.g. a superadmin/feature user opens the view on
 * a device the owner never logged into), the anchor falls back to "today", so
 * the register still starts somewhere sensible instead of inventing a past
 * date.
 */
export function getExchangeRateAnchor(): Date {
  const stored = localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN);
  return stored ? fromLocalDayKey(stored) : new Date();
}

/**
 * Auth-time daily backfill (called on every successful authentication of the
 * STORE OWNER — online login, offline roster login, and cold-boot session
 * hydration): stamps the first-login anchor on this device if absent, then
 * backfills any missing daily records through today. This is what makes the
 * register grow "every day even without navigating to the view".
 *
 * Only the OwnerAdmin role stamps/backfills here — the anchor must mean "the
 * first day the OWNER authenticated", not the first day an employee did. Any
 * authorized viewer still gets the view-time backfill in the route itself.
 *
 * Fire-and-forget on purpose: a storage failure here must never block login
 * (same policy as the entity migration pass).
 */
export async function ensureExchangeRateDailyRecords(
  user: UserModel | null,
): Promise<void> {
  if (!user || !user.isOwnerAdmin) return;
  const storeId = user.selectedStoreId;
  if (!storeId || storeId === EMPTY_GUID) return;

  try {
    if (!localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)) {
      localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(new Date()));
    }
    const { ExchangeRateOfflineService } = await import(
      '~/management/exchange-rates/lib/services/exchange-rate-offline-service'
    );
    const svc = new ExchangeRateOfflineService(storeId);
    svc.backfillDailyRecords(getExchangeRateAnchor());
  } catch {
    // Never block authentication because of the register.
  }
}