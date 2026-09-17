using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMultiMonedasModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 15, true, 0f, true, "Múltiples monedas", 125, 100f, 3f, false });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 43, true, "Funcionalidad para gestionar los precios en múltiples monedas", true, 15, "MultiMonedas", 76 });

            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[,]
                {
                    { 15, 3 },
                    { 15, 4 }
                });

            // Assign the MultiMonedas module + feature 43 (OwnerAdmin and StoreUser roles)
            // to every existing ACTIVE store on Superior (3) / VIP (4) plans.
            // Idempotent via ON CONFLICT DO NOTHING on the composite PKs (see MultiMonedasModuleBackfill).
            migrationBuilder.Sql(MultiMonedasModuleBackfill.StoreModuleSql);
            migrationBuilder.Sql(MultiMonedasModuleBackfill.StoreRoleFeatureSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove per-store rows first (FK order: StoreRoleFeature before StoreModule).
            migrationBuilder.Sql(MultiMonedasModuleBackfill.DownSql);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 43);

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 15, 3 });

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 15, 4 });

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 15);
        }
    }
}
