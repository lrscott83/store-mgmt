using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveWarehousesFromGratisPago : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data cleanup: every EXISTING store whose plan is NOT Superior (3) or VIP (4)
            // — i.e. Gratis (1) and Pago (2) — loses module 13 and features 36/37
            // (StoreRoleFeature BEFORE StoreModule — FK). Idempotent DELETE, parity with
            // VPS script backend/scripts/22-*.sql. No catalog row to remove: Warehouses was
            // never seeded into the Gratis/Pago plan catalog — the per-store rows leaked from
            // the 2026-09-05 backfill (20260905224007_Add-Warehouses-Module) that ran before
            // StorePlan existed (change remove-almacenes-from-gratis-pago, 2026-09-23).
            migrationBuilder.Sql(WarehousesPlanCleanup.CleanupSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberate no-op: there is no catalog row to recover and the migration never
            // records which non-Superior/VIP stores held module 13 (documented in
            // WarehousesPlanCleanup.DownSql — no-op by design).
            migrationBuilder.Sql(WarehousesPlanCleanup.DownSql);
        }
    }
}
