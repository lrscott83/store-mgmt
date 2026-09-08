using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWholesaleSalesAndMultiStoresModules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[,]
                {
                    { 12, true, 0f, true, "Ventas Mayoristas", 115, 100f, 2f, false },
                    { 14, true, 0f, true, "Múltiples tiendas", 120, 50f, 5f, false }
                });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 38, true, "Funcionalidad para gestionar las tiendas del propietario", true, 14, "Mis tiendas", 74 },
                    { 39, true, "Funcionalidad para gestionar las ventas mayoristas", true, 12, "Ventas Mayoristas", 75 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 38);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 39);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 12);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 14);
        }
    }
}
