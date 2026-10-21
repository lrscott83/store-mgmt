using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGestoresVentasModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-only migration: module 21, feature 125, plan assignment (Superior/VIP) and
            // role 5. No StoreModule / StoreRoleFeature rows — the module is opt-in.
            migrationBuilder.Sql(GestoresVentasModuleSeed.UpSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(GestoresVentasModuleSeed.DownSql);
        }
    }
}
