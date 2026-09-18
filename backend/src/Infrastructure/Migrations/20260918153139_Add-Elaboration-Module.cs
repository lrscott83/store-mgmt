using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddElaborationModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 17, true, 0f, true, "Elaboración", 130, 100f, 3f, false });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 120, true, "Funcionalidad para gestionar las recetas de elaboración de productos", true, 17, "Recetas", 240 },
                    { 121, true, "Funcionalidad para registrar elaboraciones con consumo de insumos y costo real", true, 17, "Elaboraciones", 241 }
                });

            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[,]
                {
                    { 17, 3 },
                    { 17, 4 }
                });

            // Assign the Elaboration module + features 120 (Recipes) and 121 (Elaborations)
            // to every existing ACTIVE store on Superior (3) / VIP (4) plans — OwnerAdmin only.
            // Idempotent via ON CONFLICT DO NOTHING on the composite PKs (see ElaborationModuleBackfill).
            migrationBuilder.Sql(ElaborationModuleBackfill.StoreModuleSql);
            migrationBuilder.Sql(ElaborationModuleBackfill.StoreRoleFeatureSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove per-store rows first (FK order: StoreRoleFeature before StoreModule).
            migrationBuilder.Sql(ElaborationModuleBackfill.DownSql);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 120);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 121);

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 17, 3 });

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 17, 4 });

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 17);
        }
    }
}
