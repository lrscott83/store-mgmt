import { useIntl } from 'react-intl';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { formatDateOnly } from '~/shared/lib/date-utils';

type BannerTone = 'blue' | 'amber' | 'red';

const TONE_CLASSES: Record<BannerTone, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
};

/**
 * Read-only projection of backend-computed billing state (design.md — the
 * client adds zero entitlement/billing math). `Vencido` outranks trial per
 * the Banner state machine: an overdue account shows the overdue notice
 * regardless of `isInTrial`.
 */
export function PaymentBanner() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  // DG-2: defaulting for a stale/pre-backend payload lives HERE, not in getMe.
  const paymentStatus = user?.paymentStatus ?? 'NoAplica';

  // No billing clock at all → nothing to say.
  if (paymentStatus === 'NoAplica') {
    return null;
  }

  // An up-to-date plan is silent UNLESS it is inside the trial. `AlDia` is the
  // status a store holds for the WHOLE trial, not an edge case: the first due
  // date is `start + trialMonths + 1 month`, so `PorVencer` (due - DueSoonDays)
  // always falls after the trial ends and can never overlap it. Returning early
  // on `AlDia` therefore made the trial notice unreachable, leaving owners with
  // no indication of the free month or of when the first charge lands.
  if (paymentStatus === 'AlDia' && !user?.isInTrial) {
    return null;
  }

  let tone: BannerTone;
  let message: string;

  if (paymentStatus === 'Vencido') {
    tone = 'red';
    message = intl.formatMessage({ id: 'BILLING.OVERDUE_NOTICE' });
  } else if (user?.isInTrial) {
    tone = 'blue';
    message = intl.formatMessage(
      { id: 'BILLING.TRIAL_NOTICE' },
      { date: formatDateOnly(user?.paymentDueDate) },
    );
  } else {
    tone = 'amber';
    message = intl.formatMessage(
      { id: 'BILLING.DUE_NOTICE' },
      { date: formatDateOnly(user?.paymentDueDate) },
    );
  }

  return (
    <div role="status" className={`border-b px-4 py-2 text-sm ${TONE_CLASSES[tone]}`}>
      {message}
    </div>
  );
}

export default PaymentBanner;
