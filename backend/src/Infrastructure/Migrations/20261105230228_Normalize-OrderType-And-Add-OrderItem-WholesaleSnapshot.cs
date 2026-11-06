using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeOrderTypeAndAddOrderItemWholesaleSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "WholesalePackSize",
                table: "OrderItem",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "WholesalePacks",
                table: "OrderItem",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "WholesaleTierMinPacks",
                table: "OrderItem",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WholesaleTierUnitPrice",
                table: "OrderItem",
                type: "numeric(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WholesaleUnitLabel",
                table: "OrderItem",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            // Data: the 101 ("WhatsApp") order type stops existing — it was a CHANNEL, and the
            // channel is Order.IsOfflineOrder now. Every historical row becomes Normal (1).
            // Idempotent UPDATE; ships in the same release that stops writing 101 on purpose.
            migrationBuilder.Sql(OrderTypeChannelNormalization.NormalizeSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Documented no-op: the retired value is not restored (see
            // OrderTypeChannelNormalization.DownSql). The columns below are dropped as generated.
            migrationBuilder.Sql(OrderTypeChannelNormalization.DownSql);

            migrationBuilder.DropColumn(
                name: "WholesalePackSize",
                table: "OrderItem");

            migrationBuilder.DropColumn(
                name: "WholesalePacks",
                table: "OrderItem");

            migrationBuilder.DropColumn(
                name: "WholesaleTierMinPacks",
                table: "OrderItem");

            migrationBuilder.DropColumn(
                name: "WholesaleTierUnitPrice",
                table: "OrderItem");

            migrationBuilder.DropColumn(
                name: "WholesaleUnitLabel",
                table: "OrderItem");
        }
    }
}
