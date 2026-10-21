using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalogEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CatalogEvent",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    VisitorHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SessionHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Path = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Source = table.Column<int>(type: "integer", nullable: false),
                    ReferrerHost = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    UtmSource = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UtmMedium = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UtmCampaign = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DeviceType = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CatalogEvent_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogEvent_StoreId_OccurredAt",
                table: "CatalogEvent",
                columns: new[] { "StoreId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogEvent_StoreId_ProductId_OccurredAt",
                table: "CatalogEvent",
                columns: new[] { "StoreId", "ProductId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogEvent_StoreId_SessionHash",
                table: "CatalogEvent",
                columns: new[] { "StoreId", "SessionHash" });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogEvent_StoreId_Type_OccurredAt",
                table: "CatalogEvent",
                columns: new[] { "StoreId", "Type", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogEvent_TenantId",
                table: "CatalogEvent",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CatalogEvent");
        }
    }
}
