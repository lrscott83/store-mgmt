using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderItemPriceSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BasePrice",
                table: "OrderItem",
                type: "numeric(18,6)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DiscountPrice",
                table: "OrderItem",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PercentDiscountPrice",
                table: "OrderItem",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BasePrice",
                table: "OrderItem");

            migrationBuilder.DropColumn(
                name: "DiscountPrice",
                table: "OrderItem");

            migrationBuilder.DropColumn(
                name: "PercentDiscountPrice",
                table: "OrderItem");
        }
    }
}
