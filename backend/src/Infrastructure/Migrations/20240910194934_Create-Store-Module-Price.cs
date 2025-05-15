using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CreateStoreModulePrice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StoreFeature");

            migrationBuilder.DropIndex(
                name: "IX_Store_TenantId",
                table: "Store");

            migrationBuilder.DropIndex(
                name: "IX_Owner_TenantId",
                table: "Owner");

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 62);

            migrationBuilder.DeleteData(
                table: "Store",
                keyColumn: "Id",
                keyValue: new Guid("0ed24a91-6748-4f04-8902-7981a0ca79e0"));

            migrationBuilder.DeleteData(
                table: "Owner",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"));

            migrationBuilder.AddColumn<bool>(
                name: "AvailableToStore",
                table: "Module",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<float>(
                name: "DiscountPrice",
                table: "Module",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<float>(
                name: "PercentDiscountPrice",
                table: "Module",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<float>(
                name: "Price",
                table: "Module",
                type: "real",
                nullable: false,
                defaultValue: 0f);

            migrationBuilder.AddColumn<bool>(
                name: "PriceIncluded",
                table: "Module",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "AvailableToStore",
                table: "Feature",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "StoreModule",
                columns: table => new
                {
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    ModuleId = table.Column<int>(type: "integer", nullable: false),
                    ModulePriceIncluded = table.Column<bool>(type: "boolean", nullable: false),
                    Price = table.Column<float>(type: "real", nullable: false),
                    ModulePrice = table.Column<float>(type: "real", nullable: false),
                    ModuleDiscountPrice = table.Column<float>(type: "real", nullable: false),
                    ModulePercentDiscountPrice = table.Column<float>(type: "real", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreModule", x => new { x.StoreId, x.ModuleId });
                    table.ForeignKey(
                        name: "FK_StoreModule_Module_ModuleId",
                        column: x => x.ModuleId,
                        principalTable: "Module",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StoreModule_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 10,
                column: "AvailableToStore",
                value: false);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 11,
                column: "AvailableToStore",
                value: false);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 20,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 21,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 22,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 23,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 30,
                columns: new[] { "AvailableToStore", "IsActive" },
                values: new object[] { true, false });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 31,
                columns: new[] { "AvailableToStore", "IsActive" },
                values: new object[] { true, false });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 32,
                columns: new[] { "AvailableToStore", "IsActive" },
                values: new object[] { true, false });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 40,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 41,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 42,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 50,
                columns: new[] { "AvailableToStore", "IsActive" },
                values: new object[] { true, false });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 60,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 61,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 63,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 64,
                column: "AvailableToStore",
                value: true);

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 12, false, "Funcionalidad para gestionar los roles", true, 1, "Roles", 20 });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "AvailableToStore", "DiscountPrice", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { false, 0f, 0f, 3.4028235E+38f, false });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "AvailableToStore", "DiscountPrice", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { true, 0f, 0f, 0f, true });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "AvailableToStore", "DiscountPrice", "IsActive", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { true, 0f, false, 0f, 500f, false });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "AvailableToStore", "DiscountPrice", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { true, 0f, 100f, 500f, true });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "AvailableToStore", "DiscountPrice", "IsActive", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { true, 0f, false, 0f, 500f, false });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "AvailableToStore", "DiscountPrice", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { true, 0f, 0f, 0f, true });

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

            migrationBuilder.CreateIndex(
                name: "IX_StoreModule_ModuleId",
                table: "StoreModule",
                column: "ModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreModule_TenantId",
                table: "StoreModule",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StoreModule");

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 12);

            migrationBuilder.DropColumn(
                name: "AvailableToStore",
                table: "Module");

            migrationBuilder.DropColumn(
                name: "DiscountPrice",
                table: "Module");

            migrationBuilder.DropColumn(
                name: "PercentDiscountPrice",
                table: "Module");

            migrationBuilder.DropColumn(
                name: "Price",
                table: "Module");

            migrationBuilder.DropColumn(
                name: "PriceIncluded",
                table: "Module");

            migrationBuilder.DropColumn(
                name: "AvailableToStore",
                table: "Feature");

            migrationBuilder.CreateTable(
                name: "StoreFeature",
                columns: table => new
                {
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureId = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreFeature", x => new { x.StoreId, x.FeatureId });
                    table.ForeignKey(
                        name: "FK_StoreFeature_Feature_FeatureId",
                        column: x => x.FeatureId,
                        principalTable: "Feature",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StoreFeature_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 30,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 31,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 32,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 50,
                column: "IsActive",
                value: true);

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 62, "Funcionalidad para gestionar los roles", true, 6, "Roles", 150 });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 3,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                column: "IsActive",
                value: true);

            migrationBuilder.InsertData(
                table: "Owner",
                columns: new[] { "Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId" },
                values: new object[] { new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 861, DateTimeKind.Unspecified).AddTicks(4382), new TimeSpan(0, 0, 0, 0, 0)), "Admin Owner", true, true, new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), null, null, new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8") });

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(1039), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(1094), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(1137), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Tenant",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 859, DateTimeKind.Unspecified).AddTicks(3196), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "User",
                keyColumn: "Id",
                keyValue: new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 859, DateTimeKind.Unspecified).AddTicks(5097), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.InsertData(
                table: "Store",
                columns: new[] { "Id", "Address", "Approved", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "OwnerId", "TenantId", "UpdatedBy", "UpdatedDate" },
                values: new object[] { new Guid("0ed24a91-6748-4f04-8902-7981a0ca79e0"), null, false, new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(6599), new TimeSpan(0, 0, 0, 0, 0)), null, true, "Default Store", new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), null, null });

            migrationBuilder.CreateIndex(
                name: "IX_Store_TenantId",
                table: "Store",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_Owner_TenantId",
                table: "Owner",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreFeature_FeatureId",
                table: "StoreFeature",
                column: "FeatureId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreFeature_TenantId",
                table: "StoreFeature",
                column: "TenantId");
        }
    }
}
