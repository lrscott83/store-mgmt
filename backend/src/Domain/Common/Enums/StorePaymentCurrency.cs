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
        /// <remarks>
        /// Exhaustive per member ON PURPOSE. The previous form was
        /// <c>currency == Cup ? "CUP" : "USD"</c>, where an implicit else meant a third member — or
        /// an out-of-range cast such as <c>(StorePaymentCurrency)7</c> — silently rendered as
        /// <c>USD</c>. Now every value needs its own arm, and an unmapped one throws instead of
        /// publishing a currency the charge was never collected in.
        /// </remarks>
        public static string ToWireValue(this StorePaymentCurrency currency)
            => currency switch
            {
                StorePaymentCurrency.Usd => "USD",
                StorePaymentCurrency.Cup => "CUP",
                _ => throw new ArgumentOutOfRangeException(
                    nameof(currency), currency,
                    "Unmapped store payment currency: the wire contract defines USD and CUP only."),
            };

        /// <summary>
        /// Is this a currency the API actually serves? Query-string model binding turns ANY numeric
        /// text into an enum value (<c>?currency=7</c> binds to <c>(StorePaymentCurrency)7</c>), so
        /// the request pipeline must ask this before such a value reaches the query — otherwise the
        /// repository's <c>== Cup</c> test reads it as USD and answers 200 on the wrong tab.
        /// </summary>
        /// <remarks>
        /// Every member is listed, so adding a currency is a visible decision here rather than a
        /// value that quietly answers 400 until someone notices.
        /// </remarks>
        public static bool IsDefinedCurrency(this StorePaymentCurrency currency)
            => currency is StorePaymentCurrency.Usd or StorePaymentCurrency.Cup;
    }
}
