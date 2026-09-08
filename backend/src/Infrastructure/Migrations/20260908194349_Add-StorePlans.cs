using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStorePlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StorePlan",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorePlan", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "StorePlan",
                columns: new[] { "Id", "IsActive", "Name", "Order" },
                values: new object[,]
                {
                    { 1, true, "Gratis", 1 },
                    { 2, true, "Pago", 2 },
                    { 3, true, "Superior", 3 },
                    { 4, true, "VIP", 4 }
                });

            migrationBuilder.AddColumn<int>(
                name: "StorePlanId",
                table: "Store",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            // Backfill: existing stores are credited with the Pago (2) plan — the same value
            // the column default writes, made explicit so the intent survives in the migration
            // and the matching VPS script.
            migrationBuilder.Sql("UPDATE \"Store\" SET \"StorePlanId\" = 2;");

            migrationBuilder.CreateIndex(
                name: "IX_Store_StorePlanId",
                table: "Store",
                column: "StorePlanId");

            migrationBuilder.AddForeignKey(
                name: "FK_Store_StorePlan_StorePlanId",
                table: "Store",
                column: "StorePlanId",
                principalTable: "StorePlan",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Store_StorePlan_StorePlanId",
                table: "Store");

            migrationBuilder.DropTable(
                name: "StorePlan");

            migrationBuilder.DropIndex(
                name: "IX_Store_StorePlanId",
                table: "Store");

            migrationBuilder.DropColumn(
                name: "StorePlanId",
                table: "Store");
        }
    }
}
