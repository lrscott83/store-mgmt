using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStoreSyncFiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StoreSyncFile",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UploadedByFullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    StoreName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    DownloadCount = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreSyncFile", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoreSyncFile_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoreSyncFileDownload",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreSyncFileId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DownloadedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreSyncFileDownload", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId",
                        column: x => x.StoreSyncFileId,
                        principalTable: "StoreSyncFile",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFile_CreatedDate",
                table: "StoreSyncFile",
                column: "CreatedDate");

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFile_StoreId",
                table: "StoreSyncFile",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFile_TenantId",
                table: "StoreSyncFile",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFileDownload_StoreSyncFileId_UserId",
                table: "StoreSyncFileDownload",
                columns: new[] { "StoreSyncFileId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFileDownload_TenantId",
                table: "StoreSyncFileDownload",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFileDownload_UserId",
                table: "StoreSyncFileDownload",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StoreSyncFileDownload");

            migrationBuilder.DropTable(
                name: "StoreSyncFile");
        }
    }
}
