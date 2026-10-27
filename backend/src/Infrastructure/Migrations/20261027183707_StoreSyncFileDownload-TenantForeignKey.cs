using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StoreSyncFileDownloadTenantForeignKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId",
                table: "StoreSyncFileDownload");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_StoreSyncFile_Id_TenantId",
                table: "StoreSyncFile",
                columns: new[] { "Id", "TenantId" });

            migrationBuilder.CreateIndex(
                name: "IX_StoreSyncFileDownload_StoreSyncFileId_TenantId",
                table: "StoreSyncFileDownload",
                columns: new[] { "StoreSyncFileId", "TenantId" });

            migrationBuilder.AddForeignKey(
                name: "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId_TenantId",
                table: "StoreSyncFileDownload",
                columns: new[] { "StoreSyncFileId", "TenantId" },
                principalTable: "StoreSyncFile",
                principalColumns: new[] { "Id", "TenantId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId_TenantId",
                table: "StoreSyncFileDownload");

            migrationBuilder.DropIndex(
                name: "IX_StoreSyncFileDownload_StoreSyncFileId_TenantId",
                table: "StoreSyncFileDownload");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_StoreSyncFile_Id_TenantId",
                table: "StoreSyncFile");

            migrationBuilder.AddForeignKey(
                name: "FK_StoreSyncFileDownload_StoreSyncFile_StoreSyncFileId",
                table: "StoreSyncFileDownload",
                column: "StoreSyncFileId",
                principalTable: "StoreSyncFile",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
