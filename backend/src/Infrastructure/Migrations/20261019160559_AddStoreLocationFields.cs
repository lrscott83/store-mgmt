using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStoreLocationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AddressCity",
                table: "Store",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AddressProvince",
                table: "Store",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "Store",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "Store",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OpeningHoursJson",
                table: "Store",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicPhone",
                table: "Store",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AddressCity",
                table: "Store");

            migrationBuilder.DropColumn(
                name: "AddressProvince",
                table: "Store");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "Store");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "Store");

            migrationBuilder.DropColumn(
                name: "OpeningHoursJson",
                table: "Store");

            migrationBuilder.DropColumn(
                name: "PublicPhone",
                table: "Store");
        }
    }
}
