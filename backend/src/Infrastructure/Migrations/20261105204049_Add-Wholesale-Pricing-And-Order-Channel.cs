using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWholesalePricingAndOrderChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PriceMode",
                table: "StoreCatalogSettings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<bool>(
                name: "WholesaleEnabled",
                table: "Product",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "WholesalePackSize",
                table: "Product",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "WholesaleUnitLabel",
                table: "Product",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsOfflineOrder",
                table: "Order",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ProductWholesaleTier",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    MinPacks = table.Column<int>(type: "integer", nullable: false),
                    PricePerUnit = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    Currency = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductWholesaleTier", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductWholesaleTier_Product_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Product",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductWholesaleTier_ProductId",
                table: "ProductWholesaleTier",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductWholesaleTier_ProductId_MinPacks",
                table: "ProductWholesaleTier",
                columns: new[] { "ProductId", "MinPacks" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductWholesaleTier_TenantId",
                table: "ProductWholesaleTier",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductWholesaleTier");

            migrationBuilder.DropColumn(
                name: "PriceMode",
                table: "StoreCatalogSettings");

            migrationBuilder.DropColumn(
                name: "WholesaleEnabled",
                table: "Product");

            migrationBuilder.DropColumn(
                name: "WholesalePackSize",
                table: "Product");

            migrationBuilder.DropColumn(
                name: "WholesaleUnitLabel",
                table: "Product");

            migrationBuilder.DropColumn(
                name: "IsOfflineOrder",
                table: "Order");
        }
    }
}
