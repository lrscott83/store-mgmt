namespace Domain.Common.Enums
{
    /// <summary>
    /// Currency a registered store payment was collected in. A payment is ONE charge in ONE
    /// currency, so this is also the tab discriminator of the payments-history screen (S4):
    /// <see cref="Usd"/> when <c>StorePayment.AmountPaid</c> is null, <see cref="Cup"/> when it has
    /// a value. It is the single source of truth — the query, the repository filter and the
    /// controller all speak this type, and no other place compares currency strings.
    /// </summary>
    public enum StorePaymentCurrency : int
    {
        Usd = 0,
        Cup = 1,
    }

    public static class StorePaymentCurrencyExtensions
    {
        /// <summary>
        /// The ONE place a currency becomes its wire string (S13). The JSON contract is fixed:
        /// <c>USD</c> / <c>CUP</c>, uppercase, on both the response root and every item.
        /// </summary>
        public static string ToWireValue(this StorePaymentCurrency currency)
            => currency == StorePaymentCurrency.Cup ? "CUP" : "USD";
    }
}
