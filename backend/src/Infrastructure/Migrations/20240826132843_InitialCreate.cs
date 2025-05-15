using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Module",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Module", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OutboxMessage",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    CreatedOnUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ProcessedOnUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboxMessage", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Role",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Role", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tenant",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    ConnectionString = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tenant", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "User",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Login = table.Column<string>(type: "text", nullable: false),
                    Password = table.Column<string>(type: "text", nullable: false),
                    FullName = table.Column<string>(type: "text", nullable: false),
                    CellPhone = table.Column<string>(type: "text", nullable: true),
                    Email = table.Column<string>(type: "text", nullable: true),
                    SelectedStoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_User", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Feature",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    ModuleId = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Feature", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Feature_Module_ModuleId",
                        column: x => x.ModuleId,
                        principalTable: "Module",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Owner",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Guest = table.Column<bool>(type: "boolean", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Owner", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Owner_User_UserId",
                        column: x => x.UserId,
                        principalTable: "User",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserRole",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRole", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_UserRole_Role_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Role",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserRole_User_UserId",
                        column: x => x.UserId,
                        principalTable: "User",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Store",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Address = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Approved = table.Column<bool>(type: "boolean", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Store", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Store_Owner_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Owner",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoreFeature",
                columns: table => new
                {
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureId = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreFeature", x => new { x.StoreId, x.FeatureId });
                    table.ForeignKey(
                        name: "FK_StoreFeature_Feature_FeatureId",
                        column: x => x.FeatureId,
                        principalTable: "Feature",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StoreFeature_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoreRoleFeature",
                columns: table => new
                {
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<int>(type: "integer", nullable: false),
                    FeatureId = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreRoleFeature", x => new { x.StoreId, x.RoleId, x.FeatureId });
                    table.ForeignKey(
                        name: "FK_StoreRoleFeature_Feature_FeatureId",
                        column: x => x.FeatureId,
                        principalTable: "Feature",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StoreRoleFeature_Role_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Role",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StoreRoleFeature_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoreUser",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    StoreId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreUser", x => new { x.UserId, x.StoreId });
                    table.ForeignKey(
                        name: "FK_StoreUser_Store_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Store",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StoreUser_User_UserId",
                        column: x => x.UserId,
                        principalTable: "User",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Module",
                columns: new[] { "Id", "IsActive", "Name", "Order" },
                values: new object[,]
                {
                    { 1, true, "Administración", 0 },
                    { 2, true, "Ventas", 10 },
                    { 3, true, "Inventario", 20 },
                    { 4, true, "Sincronización", 30 },
                    { 5, true, "Estadísticas", 40 },
                    { 6, true, "Gestión", 50 }
                });

            migrationBuilder.InsertData(
                table: "Role",
                columns: new[] { "Id", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "UpdatedBy", "UpdatedDate" },
                values: new object[,]
                {
                    { 1, new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(1039), new TimeSpan(0, 0, 0, 0, 0)), "Este Role permitirá acceder a todas las funcionalidades en todos los tenants.", true, "Super Administrador", null, null },
                    { 2, new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(1094), new TimeSpan(0, 0, 0, 0, 0)), "Este Role permitirá acceder a todas las funcionalidades de la tienda.", true, "Administrador de tienda", null, null },
                    { 3, new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(1137), new TimeSpan(0, 0, 0, 0, 0)), "Este Role permitirá acceder a las funcionalidades para un usuario de la tienda.", true, "Usuario de tienda", null, null }
                });

            migrationBuilder.InsertData(
                table: "Tenant",
                columns: new[] { "Id", "ConnectionString", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "UpdatedBy", "UpdatedDate" },
                values: new object[] { new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), "", new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 859, DateTimeKind.Unspecified).AddTicks(3196), new TimeSpan(0, 0, 0, 0, 0)), "Default Tenant to create Default Store for Super Admin User", true, "Default Tenant", null, null });

            migrationBuilder.InsertData(
                table: "User",
                columns: new[] { "Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate" },
                values: new object[] { new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"), "52432968", new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 859, DateTimeKind.Unspecified).AddTicks(5097), new TimeSpan(0, 0, 0, 0, 0)), "lrscott83@gmail.com", "Lizardo Romero", true, "admin", "XwHSL3RwmY9AkQLdRIeWr/H1xHm7ulj/la+EYwkLgrA=", new Guid("00000000-0000-0000-0000-000000000000"), new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), null, null });

            migrationBuilder.InsertData(
                table: "Feature",
                columns: new[] { "Id", "Description", "IsActive", "ModuleId", "Name", "Order" },
                values: new object[,]
                {
                    { 10, "Funcionalidad para gestionar los tenants", true, 1, "Tenants", 0 },
                    { 11, "Funcionalidad para gestionar los propietarios", true, 1, "Propietarios", 10 },
                    { 20, "Funcionalidad para gestionar los productos", true, 2, "Productos", 20 },
                    { 21, "Funcionalidad para gestionar la venta", true, 2, "Venta", 30 },
                    { 22, "Funcionalidad para gestionar las ventas del día", true, 2, "Ventas del día", 40 },
                    { 23, "Funcionalidad para revisar el cuadre de las ventas del día", true, 2, "Cuadre del día", 50 },
                    { 30, "Funcionalidad para listar la disponibilidad del inventario", true, 3, "Disponible", 60 },
                    { 31, "Funcionalidad para gestionar las entradas al inventario", true, 3, "Entradas", 70 },
                    { 32, "Funcionalidad para revisar el cuadre de las entradas del día al inventario", true, 3, "Cuadre del día", 80 },
                    { 40, "Funcionalidad para enviar los datos", true, 4, "Enviar", 90 },
                    { 41, "Funcionalidad para descargar los datos", true, 4, "Descargar", 100 },
                    { 42, "Funcionalidad para recibir los datos", true, 4, "Recibir", 110 },
                    { 50, "Funcionalidad para el cuadro de mando", true, 5, "Dashboard", 120 },
                    { 60, "Funcionalidad para gestionar el perfil del usuario autenticado", true, 6, "Perfil", 130 },
                    { 61, "Funcionalidad para gestionar los usuarios", true, 6, "Usuarios", 140 },
                    { 62, "Funcionalidad para gestionar los roles", true, 6, "Roles", 150 },
                    { 63, "Funcionalidad para gestionar las tiendas", true, 6, "Tiendas", 160 },
                    { 64, "Funcionalidad para gestionar las configuraciones", true, 6, "Configuraciones", 170 }
                });

            migrationBuilder.InsertData(
                table: "Owner",
                columns: new[] { "Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId" },
                values: new object[] { new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 861, DateTimeKind.Unspecified).AddTicks(4382), new TimeSpan(0, 0, 0, 0, 0)), "Admin Owner", true, true, new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), null, null, new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8") });

            migrationBuilder.InsertData(
                table: "UserRole",
                columns: new[] { "RoleId", "UserId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate" },
                values: new object[] { 1, new Guid("38b96d85-bf75-41ca-bfd7-796e7fe0ebc8"), new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), null, null });

            migrationBuilder.InsertData(
                table: "Store",
                columns: new[] { "Id", "Address", "Approved", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "OwnerId", "TenantId", "UpdatedBy", "UpdatedDate" },
                values: new object[] { new Guid("0ed24a91-6748-4f04-8902-7981a0ca79e0"), null, false, new Guid("00000000-0000-0000-0000-000000000000"), new DateTimeOffset(new DateTime(2024, 8, 26, 13, 28, 42, 860, DateTimeKind.Unspecified).AddTicks(6599), new TimeSpan(0, 0, 0, 0, 0)), null, true, "Default Store", new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), new Guid("b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8"), null, null });

            migrationBuilder.CreateIndex(
                name: "IX_Feature_ModuleId",
                table: "Feature",
                column: "ModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_Owner_TenantId",
                table: "Owner",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_Owner_UserId",
                table: "Owner",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Store_OwnerId",
                table: "Store",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_Store_TenantId",
                table: "Store",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreFeature_FeatureId",
                table: "StoreFeature",
                column: "FeatureId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreFeature_TenantId",
                table: "StoreFeature",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreRoleFeature_FeatureId",
                table: "StoreRoleFeature",
                column: "FeatureId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreRoleFeature_RoleId",
                table: "StoreRoleFeature",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreRoleFeature_TenantId",
                table: "StoreRoleFeature",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreUser_StoreId",
                table: "StoreUser",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreUser_TenantId",
                table: "StoreUser",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StoreUser_UserId",
                table: "StoreUser",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenant_Name",
                table: "Tenant",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_User_Login",
                table: "User",
                column: "Login",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_User_TenantId",
                table: "User",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRole_RoleId",
                table: "UserRole",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRole_TenantId",
                table: "UserRole",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OutboxMessage");

            migrationBuilder.DropTable(
                name: "StoreFeature");

            migrationBuilder.DropTable(
                name: "StoreRoleFeature");

            migrationBuilder.DropTable(
                name: "StoreUser");

            migrationBuilder.DropTable(
                name: "Tenant");

            migrationBuilder.DropTable(
                name: "UserRole");

            migrationBuilder.DropTable(
                name: "Feature");

            migrationBuilder.DropTable(
                name: "Store");

            migrationBuilder.DropTable(
                name: "Role");

            migrationBuilder.DropTable(
                name: "Module");

            migrationBuilder.DropTable(
                name: "Owner");

            migrationBuilder.DropTable(
                name: "User");
        }
    }
}
