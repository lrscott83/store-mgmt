using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Add_Reports_Module : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 61);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 63);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 64);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 30,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 31,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 32,
                column: "IsActive",
                value: true);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 50,
                columns: new[] { "Description", "Name" },
                values: new object[] { "Funcionalidad para los reportes del día", "Reportes del día" });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 60,
                columns: new[] { "Description", "IsActive", "Name" },
                values: new object[] { "Funcionalidad para el cuadro de mando", false, "Dashboard" });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                column: "Price",
                value: 1000f);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "IsActive", "Price" },
                values: new object[] { true, 1000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 0f, 1000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "IsActive", "Name", "Price" },
                values: new object[] { true, "Reportes", 1000f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "IsActive", "Name", "Price", "PriceIncluded" },
                values: new object[] { false, "Estadísticas", 2000f, false });

            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "AvailableToStore", "DiscountPrice", "IsActive", "Name", "Order", "PercentDiscountPrice", "Price", "PriceIncluded" },
                values: new object[] { 7, true, 0f, true, "Gestión", 60, 0f, 0f, true });

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

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 70, true, "Funcionalidad para gestionar el perfil del usuario autenticado", true, 7, "Perfil", 140 },
                    { 72, true, "Funcionalidad para gestionar los usuarios", true, 7, "Usuarios", 150 },
                    { 73, true, "Funcionalidad para gestionar las tiendas", true, 7, "Tiendas", 160 },
                    { 74, true, "Funcionalidad para gestionar las configuraciones", true, 7, "Configuraciones", 170 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 70);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 72);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 73);

            migrationBuilder.DeleteData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 74);

            migrationBuilder.DeleteData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 30,
                column: "IsActive",
                value: false);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 31,
                column: "IsActive",
                value: false);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 32,
                column: "IsActive",
                value: false);

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 50,
                columns: new[] { "Description", "Name" },
                values: new object[] { "Funcionalidad para el cuadro de mando", "Dashboard" });

            migrationBuilder.UpdateData(
                table: "Feature",
                keyColumn: "Id",
                keyValue: 60,
                columns: new[] { "Description", "IsActive", "Name" },
                values: new object[] { "Funcionalidad para gestionar el perfil del usuario autenticado", true, "Perfil" });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "AvailableToStore", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 61, true, "Funcionalidad para gestionar los usuarios", true, 6, "Usuarios", 140 },
                    { 63, true, "Funcionalidad para gestionar las tiendas", true, 6, "Tiendas", 160 },
                    { 64, true, "Funcionalidad para gestionar las configuraciones", true, 6, "Configuraciones", 170 }
                });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 2,
                column: "Price",
                value: 500f);

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "IsActive", "Price" },
                values: new object[] { false, 500f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "PercentDiscountPrice", "Price" },
                values: new object[] { 100f, 500f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "IsActive", "Name", "Price" },
                values: new object[] { false, "Estadísticas", 500f });

            migrationBuilder.UpdateData(
                table: "Module",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "IsActive", "Name", "Price", "PriceIncluded" },
                values: new object[] { true, "Gestión", 0f, true });

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 1,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4798), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 2,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4891), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 3,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4932), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Role",
                keyColumn: "Id",
                keyValue: 4,
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 456, DateTimeKind.Unspecified).AddTicks(4971), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "Tenant",
                keyColumn: "Id",
                keyValue: new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 455, DateTimeKind.Unspecified).AddTicks(6249), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.UpdateData(
                table: "User",
                keyColumn: "Id",
                keyValue: new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"),
                column: "CreatedDate",
                value: new DateTimeOffset(new DateTime(2025, 1, 16, 14, 55, 20, 455, DateTimeKind.Unspecified).AddTicks(8388), new TimeSpan(0, 0, 0, 0, 0)));
        }
    }
}
