using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStoreCatalogSettingsDriversOrderFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "Order",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomerName",
                table: "Order",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomerPhone",
                table: "Order",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryAddress",
                table: "Order",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeliveryType",
                table: "Order",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "DriverId",
                table: "Order",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Order",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentStatus",
                table: "Order",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Order",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "DeliveryDriver",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Phone = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeliveryDriver", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeliveryDriver_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoreCatalogSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    WhatsappNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    PickupEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    DeliveryEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    DeliveryFee = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    MinimumOrderAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    BusinessHours = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    DeliveryZones = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    LogoKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    BannerKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    PaletteId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SyncedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreCatalogSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoreCatalogSettings_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[] { 123, true, "Funcionalidad para gestionar los pedidos online de la tienda", true, 18, "Pedidos online", 251 });

            migrationBuilder.CreateIndex(
                name: "IX_Order_DriverId",
                table: "Order",
                column: "DriverId");

            migrationBuilder.CreateIndex(
                name: "IX_Order_StoreId_Code",
                table: "Order",
                columns: new[] { "StoreId", "Code" },
                unique: true,
                filter: "\"Code\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryDriver_StoreId",
                table: "DeliveryDriver",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryDriver_TenantId",
                table: "DeliveryDriver",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreCatalogSettings_StoreId",
                table: "StoreCatalogSettings",
                column: "StoreId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoreCatalogSettings_TenantId",
                table: "StoreCatalogSettings",
                column: "TenantId");

            migrationBuilder.AddForeignKey(
                name: "FK_Order_DeliveryDriver_DriverId",
                table: "Order",
                column: "DriverId",
                principalTable: "DeliveryDriver",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // --- Data: the StoreRoleFeature side of the OnlineOrders feature (123, module 18) -------
            //
            // The feature 123 catalog row is NOT here: it is seeded by FeatureEntityTypeConfiguration
            // .HasData like every other catalog feature, so EF emitted it as the InsertData above and
            // owns it in the model snapshot. What EF cannot express from the model is the per-store
            // grant, so these two statements stay raw SQL, in the shared constants so the migration,
            // the VPS script (backend/scripts/29-*.sql) and any future test read the SAME text.
            // Order matters: the per-store rows first (they FK to the catalog row the InsertData just
            // wrote), then the serial fix-up, because an explicit-PK insert never advances the serial.
            migrationBuilder.Sql(OnlineOrdersRoleFeatureBackfill.StoreRoleFeatureSql);
            migrationBuilder.Sql(OnlineOrdersRoleFeatureBackfill.SequenceFixupsSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Order_DeliveryDriver_DriverId",
                table: "Order");

            migrationBuilder.DropTable(
                name: "DeliveryDriver");

            migrationBuilder.DropTable(
                name: "StoreCatalogSettings");

            migrationBuilder.DropIndex(
                name: "IX_Order_DriverId",
                table: "Order");

            migrationBuilder.DropIndex(
                name: "IX_Order_StoreId_Code",
                table: "Order");

            // The grants this migration created go first: StoreRoleFeature.FeatureId is Restrict, so
            // the generated DeleteData below would raise a foreign-key violation if it ran before
            // them. Module 18 and its StoreModule rows are deliberately NOT touched — they predate
            // this migration.
            migrationBuilder.Sql(OnlineOrdersRoleFeatureBackfill.DownStoreRoleFeatureSql);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 123);

            migrationBuilder.DropColumn(
                name: "Code",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "CustomerName",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "CustomerPhone",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "DeliveryAddress",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "DeliveryType",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "DriverId",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                table: "Order");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Order");
        }
    }
}
