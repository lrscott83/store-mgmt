using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWebCatalogModuleVip : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "StorePlanModule",
                columns: new[] { "ModuleId", "PlanId" },
                values: new object[] { 18, 4 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "StorePlanModule",
                keyColumns: new[] { "ModuleId", "PlanId" },
                keyValues: new object[] { 18, 4 });
        }
    }
}
