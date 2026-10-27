using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOnatModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-only migration: module 22 "ONAT" (IsActive FALSE — ships dark), feature 126
            // (OwnerAdmin only), plan assignment to Superior (3) / VIP (4), and ACTIVE
            // StoreModule / StoreRoleFeature rows for every active store on those plans.
            migrationBuilder.Sql(OnatModuleBackfill.UpSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(OnatModuleBackfill.DownSql);
        }
    }
}
