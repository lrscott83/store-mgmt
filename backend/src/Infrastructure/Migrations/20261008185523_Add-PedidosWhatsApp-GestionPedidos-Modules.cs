using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPedidosWhatsAppGestionPedidosModules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[,]
                {
                    { 19, true, 0f, true, "Pedidos WhatsApp", 150, 50f, 10f, false },
                    { 20, true, 0f, true, "Gestión de pedidos", 151, 50f, 10f, false }
                });

            // ORDER NOTE (hand-moved, everything else is verbatim EF): the scaffolder emitted this
            // UpdateData BEFORE the Module 19/20 InsertData, which violates FK_Feature_Module_ModuleId —
            // moving feature 123 to module 20 requires module 20 to exist first. Observed on PostgreSQL
            // 23503. Only the statement ORDER was changed; no SQL text was rewritten.
            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 123,
                column: "ModuleId",
                value: 20);

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 124, true, "Funcionalidad para tomar pedidos por WhatsApp y configurar su envío", true, 19, "Pedidos WhatsApp", 252 });

            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[,]
                {
                    { 19, 3 },
                    { 20, 3 },
                    { 19, 4 },
                    { 20, 4 }
                });

            // --- Data: the PER-STORE side (the part EF cannot express from the model) ---------------
            //
            // Everything above is CATALOG, and EF emitted it from the HasData seeds exactly as it does
            // for every other module/feature/plan row — that is why the catalog goes through
            // ModuleEntityTypeConfiguration / FeatureEntityTypeConfiguration /
            // StorePlanModuleEntityTypeConfiguration and NEVER through raw SQL (see the 2026-10-06
            // hygiene note in OnlineOrdersRoleFeatureBackfill: a hand-written INSERT leaves the row out
            // of the model snapshot and diverges silently on the next `database update`).
            //
            // What EF cannot express is the per-store grant, so the three statements below stay raw
            // SQL, in the shared constants so the migration, the VPS script (backend/scripts/31-*.sql)
            // and any future test read the SAME text.
            //
            // Order matters: the per-store rows first (they FK to the catalog rows EF just wrote —
            // StoreModule to Module, StoreRoleFeature to Feature), THEN the serial fix-up, because an
            // InsertData with an explicit primary key never advances the serial and the next
            // EF-generated Module/Feature would collide with 19/20 or 124.
            migrationBuilder.Sql(PedidosModulesBackfill.StoreModuleSql);
            migrationBuilder.Sql(PedidosModulesBackfill.StoreRoleFeatureSql);
            migrationBuilder.Sql(PedidosModulesBackfill.SequenceFixupsSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // FK-safe order, and it must come FIRST — before every generated DeleteData below:
            //   * StoreRoleFeature 124 → deleted first, because FeatureId is Restrict and the
            //     generated DeleteData of Feature 124 would otherwise raise a foreign-key violation.
            //   * StoreModule 19/20 → deleted next, because ModuleId is Restrict and the generated
            //     DeleteData of Module 19/20 AND of the StorePlanModule rows would otherwise violate it.
            // Feature 123 rows are deliberately left alone: they are owned by
            // 20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields, which created them for the
            // same universe — this migration only fills what that one missed.
            migrationBuilder.Sql(PedidosModulesBackfill.DownSql);

            // ORDER NOTE (hand-moved, everything else is verbatim EF): the scaffolder emitted this
            // UpdateData LAST, after the Module 19/20 DeleteData, which violates FK_Feature_Module_
            // ModuleId — feature 123 still points at module 20 when module 20 is deleted. Observed on
            // PostgreSQL 23503. It must run after the DownSql (which frees StoreRoleFeature) and
            // before the StorePlanModule/Module deletes. Only the ORDER was changed; no SQL rewritten.
            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 123,
                column: "ModuleId",
                value: 18);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 124);

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 19, 3 });

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 20, 3 });

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 19, 4 });

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 20, 4 });

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 19);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 20);
        }
    }
}
