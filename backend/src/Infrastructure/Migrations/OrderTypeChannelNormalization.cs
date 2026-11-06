namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared SQL that retires the 101 ("WhatsApp") order type: every historical row is moved to
    /// Normal (1).
    /// <para>
    /// OrderType was being used for two different things: the KIND of sale (Normal/Mayorista/Merma)
    /// and the CHANNEL it came from (POS vs web catalog). The catalog orders were stored as 101, so
    /// a wholesale catalog order lost its real type. The type column now holds the real type, the
    /// channel lives in <c>Order.IsOfflineOrder</c>, and 101 stops existing.
    /// </para>
    /// <para>
    /// This backfill ships in the SAME release that stops writing 101 on purpose: a backfill that
    /// lands before the code change is undone by the next order created.
    /// </para>
    /// <para>
    /// Single source of truth: the EF migration and the VPS script
    /// (backend/scripts/46-*.sql) run these exact statements. UPDATE is naturally idempotent.
    /// </para>
    /// </summary>
    public static class OrderTypeChannelNormalization
    {
        /// <summary>Historical channel value that is no longer a type.</summary>
        public const int RetiredWhatsAppOrderType = 101;

        /// <summary>Normal (1): what a catalog order looks like once the channel is the flag.</summary>
        public const int NormalOrderType = 1;

        /// <summary>
        /// Moves every 101 row to Normal. Only the type column is touched: the rows stay online
        /// orders, because <c>IsOfflineOrder</c> defaults to false and nobody ever wrote true.
        /// </summary>
        public const string NormalizeSql = """
            UPDATE "Order" SET "OrderType" = 1 WHERE "OrderType" = 101;
            """;

        /// <summary>
        /// Deliberate no-op: the previous value (101) carried no information that the row still
        /// needs — it meant "came from the web catalog", which <c>IsOfflineOrder = false</c> already
        /// says. Restoring 101 would recreate a value the enum no longer has, so the rollback of
        /// this data step leaves the rows as Normal.
        /// </summary>
        public const string DownSql = """
            -- The retired channel value is not restored: the channel is IsOfflineOrder now.
            SELECT 1;
            """;
    }
}
