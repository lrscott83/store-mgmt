using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateModulePrices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                column: "Price",
                value: 0f);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "Price", "PriceIncluded" },
                values: new object[] { 0f, true });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "Price", "PriceIncluded" },
                values: new object[] { 0f, true });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 75f, 2000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 70, 75f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 80, 75f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 90, 75f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 100, 75f });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                column: "Price",
                value: 1000f);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "Price", "PriceIncluded" },
                values: new object[] { 1000f, false });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "Price", "PriceIncluded" },
                values: new object[] { 1000f, false });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 60, 50f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 60, 50f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 60, 50f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "Order", "PercentDiscountPrice" },
                values: new object[] { 60, 50f });
        }
    }
}
