using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWebCatalogModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 18, true, 0f, true, "Catálogo web", 140, 100f, 5f, false });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 122, true, "Funcionalidad para publicar y sincronizar el catálogo web de la tienda", true, 18, "Catálogo web", 250 });

            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[] { 18, 3 });

            // Assign the WebCatalog module + feature 122 (Catálogo web) to every existing
            // ACTIVE store on the Superior (3) plan — the ONLY plan that includes it
            // (owner decision D5, 2026-09-27: VIP is deliberately excluded). OwnerAdmin only.
            // Idempotent via ON CONFLICT DO NOTHING on the composite PKs
            // (see WebCatalogModuleBackfill).
            migrationBuilder.Sql(WebCatalogModuleBackfill.StoreModuleSql);
            migrationBuilder.Sql(WebCatalogModuleBackfill.StoreRoleFeatureSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove per-store rows first (FK order: StoreRoleFeature before StoreModule).
            migrationBuilder.Sql(WebCatalogModuleBackfill.DownSql);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 122);

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 18, 3 });

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 18);
        }
    }
}
