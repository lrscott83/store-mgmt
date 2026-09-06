using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehousesModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 13, true, 0f, true, "Almacenes", 110, 100f, 2f, false });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 36, true, "Funcionalidad para gestionar los almacenes", true, 13, "Almacenes", 72 },
                    { 37, true, "Funcionalidad para gestionar los movimientos de los almacenes", true, 13, "Movimientos de almacén", 73 }
                });

            // Assign the Warehouses module + OwnerAdmin features to every existing active store.
            // Idempotent via ON CONFLICT DO NOTHING on the composite PKs (see WarehousesModuleBackfill).
            migrationBuilder.Sql(WarehousesModuleBackfill.StoreModuleSql);
            migrationBuilder.Sql(WarehousesModuleBackfill.StoreRoleFeatureSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove per-store rows first (FK order: StoreRoleFeature before StoreModule).
            migrationBuilder.Sql(WarehousesModuleBackfill.DownSql);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 36);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 37);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 13);
        }
    }
}
