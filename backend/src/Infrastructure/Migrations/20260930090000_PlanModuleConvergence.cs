using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlanModuleConvergence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Converge the plan/module matrix AND every store's granted modules and role
            // features onto docs/contrains/plan-modulos-tiendas.md.
            //
            // The catalog half is already satisfied in smca_test — Pago (10), Superior (16)
            // and VIP (17) all match the specification — so it is a self-healing no-op here
            // and corrective only if the VPS drifted. The per-store half is the real fix:
            // 9 of 10 test stores were missing most of their plan's modules because
            // ChangeStorePlanCommand returns success before reconciling when the plan is
            // unchanged (line 116), and because Toggle/Update store paths write StoreModule
            // rows without building the universe.
            //
            // Fully idempotent, no hard deletes, negotiated pricing preserved.
            migrationBuilder.Sql(PlanModuleConvergenceSql.UpSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op by design — see PlanModuleConvergenceSql.DownSql.
            migrationBuilder.Sql(PlanModuleConvergenceSql.DownSql);
        }
    }
}
