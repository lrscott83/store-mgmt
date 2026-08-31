using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateModulePricesV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Reportes (5): pasa al plan de pago base
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 0f, 0f, true });

            // Estadísticas (6): 1 USD
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1f });

            // Gastos (8): 1 USD
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1f });

            // Facturación (9): 1 USD
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1f });

            // Historiales (10): 1 USD
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1f });

            // Créditos (11): 1 USD
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1f });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revert Reportes (5)
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 75f, 2000f, false });

            // Revert Estadísticas (6)
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });

            // Revert Gastos (8)
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });

            // Revert Facturación (9)
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });

            // Revert Historiales (10)
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });

            // Revert Créditos (11)
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });
        }
    }
}
