using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveStorePaymentFromStoreScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // StorePayment (91) is SuperAdmin/ReSeller-only (StoreRoleFeatures.StorePaymentAdmin)
            // — not a store capability. AvailableToStore=false stops the StoreRoleFeature
            // generator from materialising its SuperAdmin/ReSeller rows inside every new store
            // (decisión del usuario 2026-09-26).
            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 91,
                column: "AvailableToStore",
                value: false);

            // Data cleanup: delete the SuperAdmin/ReSeller SRF rows already persisted in
            // existing stores. Idempotent DELETE, parity with VPS script
            // backend/scripts/23-*.sql. ReSeller payment authorization is enum-based
            // (AllowedFeaturesService.GetReSellerAllowedFeatureIdsByRoleAsync), so nothing
            // functional is lost.
            migrationBuilder.Sql(StorePaymentStoreScopeRemoval.CleanupSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Per-store cleanup is not reversible (documented in
            // StorePaymentStoreScopeRemoval.DownSql — no-op by design); the flag is restored.
            migrationBuilder.Sql(StorePaymentStoreScopeRemoval.DownSql);
            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 91,
                column: "AvailableToStore",
                value: true);
        }
    }
}
