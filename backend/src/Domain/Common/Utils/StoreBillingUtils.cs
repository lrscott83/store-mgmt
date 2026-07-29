using System;

namespace Domain.Common.Utils
{
    public enum StoreBillingStatusType
    {
        NoAplica,
        AlDia,
        PorVencer,
        EnGracia,
        Vencido,
    }

    public static class StoreBillingUtils
    {
        /// Commission the reseller earns from an amount — the same discount shape as GetCurrentPrice.
        public static float GetReSellerCommission(float amount, float percentDiscountPrice, float discountPrice)
            => amount - CurrentPriceServiceUtils.GetCurrentPrice(amount, percentDiscountPrice, discountPrice);

        /// First due ≈ activation + trial + 1 post-paid month; afterwards the latest paid PaymentBeforeDate.
        /// Returns null when paymentStartDate is null — no billing clock has started.
        public static DateOnly? GetNextDueDate(DateOnly? paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate)
        {
            if (lastPaidBeforeDate is not null) return lastPaidBeforeDate;
            if (paymentStartDate is null) return null;
            return paymentStartDate.Value.AddMonths(trialMonths + 1);
        }

        public static StoreBillingStatusType GetStatus(DateOnly? paymentStartDate, DateOnly? nextDueDate, DateOnly today, int dueSoonDays, int graceDays)
        {
            if (paymentStartDate is null || nextDueDate is null) return StoreBillingStatusType.NoAplica;
            var due = nextDueDate.Value;
            if (today > due.AddDays(graceDays)) return StoreBillingStatusType.Vencido;
            if (today > due) return StoreBillingStatusType.EnGracia;
            if (today >= due.AddDays(-dueSoonDays)) return StoreBillingStatusType.PorVencer;
            return StoreBillingStatusType.AlDia;
        }

        public static bool IsPaidPlanActive(DateOnly? paymentStartDate, DateOnly? nextDueDate, DateOnly today, int graceDays)
            => paymentStartDate is not null && nextDueDate is not null && today <= nextDueDate.Value.AddDays(graceDays);

        public static bool IsInTrial(DateOnly? paymentStartDate, int trialMonths, DateOnly today)
            => paymentStartDate is not null && today <= paymentStartDate.Value.AddMonths(trialMonths);
    }
}
