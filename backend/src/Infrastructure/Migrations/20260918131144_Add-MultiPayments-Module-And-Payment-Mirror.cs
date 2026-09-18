using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMultiPaymentsModuleAndPaymentMirror : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ChannelExchangeRate",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    Method = table.Column<int>(type: "integer", nullable: false),
                    Currency = table.Column<int>(type: "integer", nullable: false),
                    Value = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    EffectiveFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChannelExchangeRate", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChannelExchangeRate_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OrderPayment",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Method = table.Column<int>(type: "integer", nullable: false),
                    Currency = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    RateApplied = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    RateMethod = table.Column<int>(type: "integer", nullable: true),
                    RateCurrency = table.Column<int>(type: "integer", nullable: true),
                    RateEffectiveFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AmountInOrderCurrency = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderPayment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderPayment_Order_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Order",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 16, true, 0f, true, "Múltiples pagos", 126, 50f, 10f, false });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 44, true, "Funcionalidad para pagar una venta con varios pagos y canales", true, 16, "MultiPayments", 77 });

            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[] { 16, 4 });

            migrationBuilder.CreateIndex(
                name: "IX_ChannelExchangeRate_StoreId",
                table: "ChannelExchangeRate",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_ChannelExchangeRate_TenantId",
                table: "ChannelExchangeRate",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderPayment_OrderId",
                table: "OrderPayment",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderPayment_TenantId",
                table: "OrderPayment",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChannelExchangeRate");

            migrationBuilder.DropTable(
                name: "OrderPayment");

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 44);

            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 16, 4 });

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 16);
        }
    }
}
