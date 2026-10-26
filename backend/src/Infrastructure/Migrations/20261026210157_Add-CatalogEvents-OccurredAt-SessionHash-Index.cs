using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalogEventsOccurredAtSessionHashIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_CatalogEvent_OccurredAt_SessionHash",
                table: "CatalogEvent",
                columns: new[] { "OccurredAt", "SessionHash" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CatalogEvent_OccurredAt_SessionHash",
                table: "CatalogEvent");
        }
    }
}
