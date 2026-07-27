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
        public static DateOnly GetNextDueDate(DateOnly paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate)
            => lastPaidBeforeDate ?? paymentStartDate.AddMonths(trialMonths + 1);

        public static StoreBillingStatusType GetStatus(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int dueSoonDays, int graceDays)
        {
            if (paymentStartDate is null) return StoreBillingStatusType.NoAplica;
            if (today > nextDueDate.AddDays(graceDays)) return StoreBillingStatusType.Vencido;
            if (today > nextDueDate) return StoreBillingStatusType.EnGracia;
            if (today >= nextDueDate.AddDays(-dueSoonDays)) return StoreBillingStatusType.PorVencer;
            return StoreBillingStatusType.AlDia;
        }

        public static bool IsPaidPlanActive(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int graceDays)
            => paymentStartDate is not null && today <= nextDueDate.AddDays(graceDays);

        public static bool IsInTrial(DateOnly? paymentStartDate, int trialMonths, DateOnly today)
            => paymentStartDate is not null && today <= paymentStartDate.Value.AddMonths(trialMonths);
    }
}
