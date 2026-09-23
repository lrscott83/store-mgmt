using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveWholesaleSalesFromPagoPlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Catalog: Pago (2) no longer lists WholesaleSales (12) — the change
            // wholesale-superior-vip-only (2026-09-23) reserves it for Superior/VIP.
            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 12, 2 });

            // Data cleanup: every EXISTING Pago store loses module 12 and feature 39
            // (StoreRoleFeature BEFORE StoreModule — FK). Idempotent DELETE, parity with
            // VPS script backend/scripts/21-*.sql and the E2E cleanup tests.
            migrationBuilder.Sql(WholesaleSalesPagoRemoval.CleanupSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Catalog row restored; per-store removal is not reversible (documented in
            // WholesaleSalesPagoRemoval.DownSql — no-op by design).
            migrationBuilder.Sql(WholesaleSalesPagoRemoval.DownSql);
            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[] { 12, 2 });
        }
    }
}