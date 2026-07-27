using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StorePaymentReSellerCommissionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ByReSeller",
                table: "StorePayment",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<float>(
                name: "ReSellerAmount",
                table: "StorePayment",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<float>(
                name: "ReSellerDiscountPrice",
                table: "StorePayment",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<Guid>(
                name: "ReSellerId",
                table: "StorePayment",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "ReSellerPercentDiscountPrice",
                table: "StorePayment",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "PaymentStartDate",
                table: "Store",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.CreateIndex(
                name: "IX_StorePayment_ReSellerId",
                table: "StorePayment",
                column: "ReSellerId");

            migrationBuilder.AddForeignKey(
                name: "FK_StorePayment_ReSeller_ReSellerId",
                table: "StorePayment",
                column: "ReSellerId",
                principalTable: "ReSeller",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StorePayment_ReSeller_ReSellerId",
                table: "StorePayment");

            migrationBuilder.DropIndex(
                name: "IX_StorePayment_ReSellerId",
                table: "StorePayment");

            migrationBuilder.DropColumn(
                name: "ByReSeller",
                table: "StorePayment");

            migrationBuilder.DropColumn(
                name: "ReSellerAmount",
                table: "StorePayment");

            migrationBuilder.DropColumn(
                name: "ReSellerDiscountPrice",
                table: "StorePayment");

            migrationBuilder.DropColumn(
                name: "ReSellerId",
                table: "StorePayment");

            migrationBuilder.DropColumn(
                name: "ReSellerPercentDiscountPrice",
                table: "StorePayment");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "PaymentStartDate",
                table: "Store",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1),
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);
        }
    }
}
