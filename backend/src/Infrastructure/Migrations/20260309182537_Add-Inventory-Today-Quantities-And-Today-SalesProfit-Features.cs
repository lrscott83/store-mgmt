using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryTodayQuantitiesAndTodaySalesProfitFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 34, true, "Funcionalidad para revisar las entradas y ventas del día", true, 3, "Cantidades del día", 81 },
                    { 35, true, "Funcionalidad para revisar las ganancias de las ventas del día", true, 3, "Ganancias del día", 81 },
                    { 103, true, "Funcionalidad para listar el historial de los créditos", true, 10, "Historial de créditos", 220 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 34);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 35);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 103);
        }
    }
}
