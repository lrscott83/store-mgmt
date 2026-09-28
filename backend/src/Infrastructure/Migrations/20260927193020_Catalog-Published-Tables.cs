using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CatalogPublishedTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CatalogCategory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceCategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "character varying(63)", maxLength: 63, nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    SyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogCategory", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CatalogProduct",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    CatalogCategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false, defaultValue: ""),
                    Price = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    Currency = table.Column<int>(type: "integer", nullable: false),
                    PercentDiscountPrice = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    DiscountPrice = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    IsNew = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    Image = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    SyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogProduct", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CatalogProduct_CatalogCategory_CatalogCategoryId",
                        column: x => x.CatalogCategoryId,
                        principalTable: "CatalogCategory",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CatalogProductImage",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CatalogProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Path = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogProductImage", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CatalogProductImage_CatalogProduct_CatalogProductId",
                        column: x => x.CatalogProductId,
                        principalTable: "CatalogProduct",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogCategory_StoreId",
                table: "CatalogCategory",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogCategory_StoreId_Slug",
                table: "CatalogCategory",
                columns: new[] { "StoreId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CatalogCategory_StoreId_SourceCategoryId",
                table: "CatalogCategory",
                columns: new[] { "StoreId", "SourceCategoryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CatalogCategory_TenantId",
                table: "CatalogCategory",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogProduct_CatalogCategoryId",
                table: "CatalogProduct",
                column: "CatalogCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogProduct_StoreId",
                table: "CatalogProduct",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogProduct_StoreId_SourceProductId",
                table: "CatalogProduct",
                columns: new[] { "StoreId", "SourceProductId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CatalogProduct_TenantId",
                table: "CatalogProduct",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogProductImage_CatalogProductId",
                table: "CatalogProductImage",
                column: "CatalogProductId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogProductImage_TenantId",
                table: "CatalogProductImage",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CatalogProductImage");

            migrationBuilder.DropTable(
                name: "CatalogProduct");

            migrationBuilder.DropTable(
                name: "CatalogCategory");
        }
    }
}
