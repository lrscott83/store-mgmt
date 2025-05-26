using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ActiveReportModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 50,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 5, 22, 17, 57, 34, 247, DateTimeKind.Unspecified).AddTicks(5051), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 5, 22, 17, 57, 34, 247, DateTimeKind.Unspecified).AddTicks(5132), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 5, 22, 17, 57, 34, 247, DateTimeKind.Unspecified).AddTicks(5189), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 4,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 5, 22, 17, 57, 34, 247, DateTimeKind.Unspecified).AddTicks(5242), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Tenant",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 5, 22, 17, 57, 34, 246, DateTimeKind.Unspecified).AddTicks(3805), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "User",
                keyColumn: "Id",
                keyValue: new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 5, 22, 17, 57, 34, 246, DateTimeKind.Unspecified).AddTicks(6599), new TimeSpan(0, 0, 0, 0, 0)));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 50,
                column: "IsActive",
                value: false);

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 487, DateTimeKind.Unspecified).AddTicks(4417), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 487, DateTimeKind.Unspecified).AddTicks(4476), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 487, DateTimeKind.Unspecified).AddTicks(4521), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 4,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 487, DateTimeKind.Unspecified).AddTicks(4562), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Tenant",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 486, DateTimeKind.Unspecified).AddTicks(5502), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "User",
                keyColumn: "Id",
                keyValue: new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 486, DateTimeKind.Unspecified).AddTicks(7709), new TimeSpan(0, 0, 0, 0, 0)));
        }
    }
}
