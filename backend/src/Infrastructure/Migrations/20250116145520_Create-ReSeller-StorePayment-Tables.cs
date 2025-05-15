using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CreateReSellerStorePaymentTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "PaymentStartDate",
                table: "Store",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.CreateTable(
                name: "ReSeller",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Approved = table.Column<bool>(type: "boolean", nullable: false),
                    DiscountPrice = table.Column<float>(type: "real", nullable: false),
                    PercentDiscountPrice = table.Column<float>(type: "real", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReSeller", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReSeller_User_UserId",
                        column: x => x.UserId,
                        principalTable: "User",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StorePaymentStatus",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorePaymentStatus", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SystemConfiguration",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemConfiguration", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReSellerOwner",
                columns: table => new
                {
                    ReSellerId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    DiscountPrice = table.Column<float>(type: "real", nullable: false),
                    PercentDiscountPrice = table.Column<float>(type: "real", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReSellerOwner", x => new { x.ReSellerId, x.OwnerId });
                    table.ForeignKey(
                        name: "FK_ReSellerOwner_Owner_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Owner",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReSellerOwner_ReSeller_ReSellerId",
                        column: x => x.ReSellerId,
                        principalTable: "ReSeller",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StorePayment",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    StorePaymentStatusId = table.Column<int>(type: "integer", nullable: false),
                    PaidDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NotificationDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PaymentBeforeDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Price = table.Column<float>(type: "real", nullable: false),
                    Year = table.Column<int>(type: "integer", nullable: false),
                    Month = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorePayment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StorePayment_StorePaymentStatus_StorePaymentStatusId",
                        column: x => x.StorePaymentStatusId,
                        principalTable: "StorePaymentStatus",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StorePayment_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 12,
                column: "Order",
                value: 30);

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 13, false, "Funcionalidad para gestionar los gestores", true, 1, "Gestores", 20 });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                column: "Price",
                value: 500f);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                column: "PriceIncluded",
                value: false);

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4798), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4891), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4932), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.InsertData(
                table: "Role",
                columns: new[] { "Id", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "UpdatedBy", "UpdatedDate" },
                values: new object[] { 4, new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4971), new TimeSpan(0, 0, 0, 0, 0)), "Este Role permitirá acceder a las funcionalidades para un usuario comercializador del servicio.", true, "Comercializador del servicio", null, null });

            migrationBuilder.InsertData(
                table: "StorePaymentStatus",
                columns: new[] { "Id", "Name" },
                values: new object[,]
                {
                    { 1, "Created" },
                    { 2, "Notified" },
                    { 3, "Invoiced" },
                    { 4, "Approved" },
                    { 5, "Paid" }
                });

            migrationBuilder.InsertData(
                table: "SystemConfiguration",
                columns: new[] { "Id", "Name", "Value" },
                values: new object[,]
                {
                    { 1, "TestingPeriodInMonths", "1" },
                    { 2, "ReSellerPercentDiscountPrice", "25" }
                });

            migrationBuilder.UpdateData(
                table: "Tenant",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 455, DateTimeKind.Unspecified).AddTicks(6249), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "User",
                keyColumn: "Id",
                keyValue: new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 455, DateTimeKind.Unspecified).AddTicks(8388), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.CreateIndex(
                name: "IX_StoreModule_StoreId",
                table: "StoreModule",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_Owner_TenantId",
                table: "Owner",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_ReSeller_TenantId",
                table: "ReSeller",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_ReSeller_UserId",
                table: "ReSeller",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReSellerOwner_OwnerId",
                table: "ReSellerOwner",
                column: "OwnerId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReSellerOwner_ReSellerId",
                table: "ReSellerOwner",
                column: "ReSellerId");

            migrationBuilder.CreateIndex(
                name: "IX_ReSellerOwner_TenantId",
                table: "ReSellerOwner",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StorePayment_StoreId",
                table: "StorePayment",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_StorePayment_StorePaymentStatusId",
                table: "StorePayment",
                column: "StorePaymentStatusId");

            migrationBuilder.CreateIndex(
                name: "IX_StorePayment_TenantId",
                table: "StorePayment",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_SystemConfiguration_Name",
                table: "SystemConfiguration",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReSellerOwner");

            migrationBuilder.DropTable(
                name: "StorePayment");

            migrationBuilder.DropTable(
                name: "SystemConfiguration");

            migrationBuilder.DropTable(
                name: "ReSeller");

            migrationBuilder.DropTable(
                name: "StorePaymentStatus");

            migrationBuilder.DropIndex(
                name: "IX_StoreModule_StoreId",
                table: "StoreModule");

            migrationBuilder.DropIndex(
                name: "IX_Owner_TenantId",
                table: "Owner");

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 13);

            migrationBuilder.DeleteData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 4);

            migrationBuilder.DropColumn(
                name: "PaymentStartDate",
                table: "Store");

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 12,
                column: "Order",
                value: 20);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                column: "Price",
                value: 0f);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                column: "PriceIncluded",
                value: true);

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 9, 10, 19, 49, 34, 453, DateTimeKind.Unspecified).AddTicks(8068), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 9, 10, 19, 49, 34, 453, DateTimeKind.Unspecified).AddTicks(8173), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 9, 10, 19, 49, 34, 453, DateTimeKind.Unspecified).AddTicks(8215), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Tenant",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 9, 10, 19, 49, 34, 453, DateTimeKind.Unspecified).AddTicks(456), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "User",
                keyColumn: "Id",
                keyValue: new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 9, 10, 19, 49, 34, 453, DateTimeKind.Unspecified).AddTicks(2255), new TimeSpan(0, 0, 0, 0, 0)));
        }
    }
}
