using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateWarehousesPrice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Catálogo: Warehouses (13) → Price 5, 50% descuento (efectivo 2.5)
            migrationBuilder.Sql(@"
                UPDATE ""Module""
                SET ""Price"" = 5,
                    ""PercentDiscountPrice"" = 50,
                    ""DiscountPrice"" = 0
                WHERE ""Id"" = 13
            ");

            // Todas las tiendas existentes: sincronizar snapshot de precios del módulo 13
            migrationBuilder.Sql(@"
                UPDATE ""StoreModule""
                SET ""Price"" = 5,
                    ""ModulePrice"" = 5,
                    ""ModulePercentDiscountPrice"" = 50,
                    ""ModuleDiscountPrice"" = 0
                WHERE ""ModuleId"" = 13 AND ""ModulePriceIncluded"" = false
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revertir catálogo a Price 2, 100% descuento (efectivo 0)
            migrationBuilder.Sql(@"
                UPDATE ""Module""
                SET ""Price"" = 2,
                    ""PercentDiscountPrice"" = 100,
                    ""DiscountPrice"" = 0
                WHERE ""Id"" = 13
            ");

            // Revertir snapshots de tiendas al estado anterior
            migrationBuilder.Sql(@"
                UPDATE ""StoreModule""
                SET ""Price"" = 2,
                    ""ModulePrice"" = 2,
                    ""ModulePercentDiscountPrice"" = 100,
                    ""ModuleDiscountPrice"" = 0
                WHERE ""ModuleId"" = 13 AND ""ModulePriceIncluded"" = false
            ");
        }
    }
}
