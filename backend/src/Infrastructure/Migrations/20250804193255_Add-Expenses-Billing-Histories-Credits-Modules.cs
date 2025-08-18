using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddExpensesBillingHistoriesCreditsModules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StoreUsage_StoreId",
                table: "StoreUsage");

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 16, false, "Funcionalidad para mostrar el dashboard", true, 1, "Dashboard", 2 });

            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[,]
                {
                    { 8, true, 0f, true, "Gastos", 60, 50f, 2000f, false },
                    { 9, true, 0f, true, "Facturación", 60, 50f, 2000f, false },
                    { 10, true, 0f, true, "Historiales", 60, 50f, 2000f, false },
                    { 11, true, 0f, true, "Créditos", 60, 50f, 2000f, false }
                });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 80, true, "Funcionalidad para gestionar los gastos del día", true, 8, "Gastos del día", 180 },
                    { 90, true, "Funcionalidad para generar facturas", true, 9, "Facturación", 190 },
                    { 100, true, "Funcionalidad para listar el historial de las ventas", true, 10, "Historial de ventas", 200 },
                    { 101, true, "Funcionalidad para listar el historial de las entradas", true, 10, "Historial de entradas", 210 },
                    { 102, true, "Funcionalidad para listar el historial de los gastos", true, 10, "Historial de gastos", 220 },
                    { 110, true, "Funcionalidad para hacer ventas a crédito", true, 11, "Venta a crédito", 230 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_StoreUsage_StoreId_Day",
                table: "StoreUsage",
                columns: new[] { "StoreId", "Day" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StoreUsage_StoreId_Day",
                table: "StoreUsage");

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 16);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 80);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 90);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 100);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 101);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 102);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 110);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 8);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 9);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 10);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 11);

            migrationBuilder.CreateIndex(
                name: "IX_StoreUsage_StoreId",
                table: "StoreUsage",
                column: "StoreId");
        }
    }
}
