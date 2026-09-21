using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class BackfillWholesaleSalesMultiStoresRoleFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No catalog change: modules 12/14 and features 38/39 already exist
            // (20260908194626_Add-WholesaleSales-And-MultiStores-Modules). The missing
            // piece was their StoreRoleFeature rows — StoreRoleFeatures.cs had no mapping
            // for features 38/39, so the generator never produced them. Backfill every
            // existing ACTIVE store that holds the module. Idempotent (ON CONFLICT).
            migrationBuilder.Sql(WholesaleSalesMultiStoresRoleFeatureBackfill.StoreRoleFeatureSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(WholesaleSalesMultiStoresRoleFeatureBackfill.DownSql);
        }
    }
}
