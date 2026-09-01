using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateModulePricesV3 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Catálogo: todos los módulos de pago → Price=2, 50% descuento
            migrationBuilder.Sql(@"
                UPDATE ""Module""
                SET ""Price"" = 2,
                    ""PercentDiscountPrice"" = 50,
                    ""DiscountPrice"" = 0
                WHERE ""PriceIncluded"" = false
            ");

            // Todas las tiendas existentes: sincronizar precios de módulos de pago
            migrationBuilder.Sql(@"
                UPDATE ""StoreModule""
                SET ""Price"" = 2,
                    ""ModulePrice"" = 2,
                    ""ModulePercentDiscountPrice"" = 50,
                    ""ModuleDiscountPrice"" = 0
                WHERE ""ModulePriceIncluded"" = false
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revertir catálogo a precio base 0
            migrationBuilder.Sql(@"
                UPDATE ""Module""
                SET ""Price"" = 0,
                    ""PercentDiscountPrice"" = 0,
                    ""DiscountPrice"" = 0
                WHERE ""PriceIncluded"" = false
            ");

            // Revertir tiendas a precio base 0
            migrationBuilder.Sql(@"
                UPDATE ""StoreModule""
                SET ""Price"" = 0,
                    ""ModulePrice"" = 0,
                    ""ModulePercentDiscountPrice"" = 0,
                    ""ModuleDiscountPrice"" = 0
                WHERE ""ModulePriceIncluded"" = false
            ");
        }
    }
}
