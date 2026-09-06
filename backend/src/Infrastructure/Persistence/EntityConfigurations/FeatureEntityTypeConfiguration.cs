using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Features;
using Domain.Common.Enums;
using Domain.Common.Extensions;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class FeatureEntityTypeConfiguration : IEntityTypeConfiguration<Feature>
    {
        private readonly ApplicationDbContext _context;
        public FeatureEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Feature> builder)
        {
            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.StoreRoleFeatures)
              .WithOne(e => e.Feature)
              .HasForeignKey(x => x.FeatureId)
              .OnDelete(DeleteBehavior.Restrict);

            builder.HasData(
                // Administration
                Feature.Create(
                    (int)FeatureType.Tenants,
                    FeatureType.Tenants.GetDescription(),
                    "Funcionalidad para gestionar los tenants",
                    (int)ModuleType.Administration,
                    0,
                    false,
                    true
                ),
                Feature.Create(
                    (int)FeatureType.AdminStores,
                    FeatureType.AdminStores.GetDescription(),
                    "Funcionalidad para gestionar todas las tiendas",
                    (int)ModuleType.Administration,
                    1,
                    false,
                    true
                ),
                Feature.Create(
                    (int)FeatureType.AdminDashboard,
                    FeatureType.AdminDashboard.GetDescription(),
                    "Funcionalidad para mostrar el dashboard",
                    (int)ModuleType.Administration,
                    2,
                    false,
                    true
                ),
                Feature.Create(
                    (int)FeatureType.Owners,
                    FeatureType.Owners.GetDescription(),
                    "Funcionalidad para gestionar los propietarios",
                    (int)ModuleType.Administration,
                    10,
                    false,
                    true
                ),
                Feature.Create(
                    (int)FeatureType.ReSellers,
                    FeatureType.ReSellers.GetDescription(),
                    "Funcionalidad para gestionar los gestores",
                    (int)ModuleType.Administration,
                    20,
                    false,
                    true
                ),
                Feature.Create(
                     (int)FeatureType.Roles,
                     FeatureType.Roles.GetDescription(),
                     "Funcionalidad para gestionar los roles",
                     (int)ModuleType.Administration,
                     30,
                     false,
                     true
                 ),
                Feature.Create(
                     (int)FeatureType.Features,
                     FeatureType.Features.GetDescription(),
                     "Funcionalidad para gestionar las funcionalidades",
                     (int)ModuleType.Administration,
                     40,
                     false,
                     true
                 ),

                 // Sales
                 Feature.Create(
                     (int)FeatureType.Products,
                     FeatureType.Products.GetDescription(),
                     "Funcionalidad para gestionar los productos",
                     (int)ModuleType.Sales,
                     20,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Sale,
                     FeatureType.Sale.GetDescription(),
                     "Funcionalidad para gestionar la venta",
                     (int)ModuleType.Sales,
                     30,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.TodayOrders,
                     FeatureType.TodayOrders.GetDescription(),
                     "Funcionalidad para gestionar las ventas del día",
                     (int)ModuleType.Sales,
                     40,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.TodayOrdersStats,
                     FeatureType.TodayOrdersStats.GetDescription(),
                     "Funcionalidad para revisar el cuadre de las ventas del día",
                     (int)ModuleType.Sales,
                     50,
                     true,
                     true
                 ),

                 // Inventory
                 Feature.Create(
                     (int)FeatureType.Available,
                     FeatureType.Available.GetDescription(),
                     "Funcionalidad para listar la disponibilidad del inventario",
                     (int)ModuleType.Inventory,
                     60,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Entries,
                     FeatureType.Entries.GetDescription(),
                     "Funcionalidad para gestionar las entradas al inventario",
                     (int)ModuleType.Inventory,
                     70,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Egress,
                     FeatureType.Egress.GetDescription(),
                     "Funcionalidad para adicionar las salidas del inventario",
                     (int)ModuleType.Inventory,
                     71,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.TodayInventoryStats,
                     FeatureType.TodayInventoryStats.GetDescription(),
                     "Funcionalidad para revisar el cuadre de las entradas del día al inventario",
                     (int)ModuleType.Inventory,
                     80,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.InventoryTodayQuantities,
                     FeatureType.InventoryTodayQuantities.GetDescription(),
                     "Funcionalidad para revisar las entradas y ventas del día",
                     (int)ModuleType.Inventory,
                     81,
                     true,
                     true
                 ),
                  Feature.Create(
                      (int)FeatureType.InventoryTodaySaleProfit,
                      FeatureType.InventoryTodaySaleProfit.GetDescription(),
                      "Funcionalidad para revisar las ganancias de las ventas del día",
                      (int)ModuleType.Inventory,
                      81,
                      true,
                      true
                  ),
                  Feature.Create(
                      (int)FeatureType.Warehouses,
                      FeatureType.Warehouses.GetDescription(),
                      "Funcionalidad para gestionar los almacenes",
                      (int)ModuleType.Warehouses,
                      72,
                      true,
                      true
                  ),
                  Feature.Create(
                      (int)FeatureType.WarehouseStockMovements,
                      FeatureType.WarehouseStockMovements.GetDescription(),
                      "Funcionalidad para gestionar los movimientos de los almacenes",
                      (int)ModuleType.Warehouses,
                      73,
                      true,
                      true
                  ),

                 // Synchronization
                 Feature.Create(
                     (int)FeatureType.Send,
                     FeatureType.Send.GetDescription(),
                     "Funcionalidad para enviar los datos",
                     (int)ModuleType.Synchronization,
                     90,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Download,
                     FeatureType.Download.GetDescription(),
                     "Funcionalidad para descargar los datos",
                     (int)ModuleType.Synchronization,
                     100,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Receive,
                     FeatureType.Receive.GetDescription(),
                     "Funcionalidad para recibir los datos",
                     (int)ModuleType.Synchronization,
                     110,
                     true,
                     true
                 ),

                 // Reports
                 Feature.Create(
                     (int)FeatureType.TodayReports,
                     FeatureType.TodayReports.GetDescription(),
                     "Funcionalidad para los reportes del día",
                     (int)ModuleType.Reports,
                     120,
                     true,
                     true
                 ),

                 // Statistics
                 Feature.Create(
                     (int)FeatureType.Dashboard,
                     FeatureType.Dashboard.GetDescription(),
                     "Funcionalidad para el cuadro de mando",
                     (int)ModuleType.Statistics,
                     130,
                     true,
                     true
                 ),

                 // Management
                 Feature.Create(
                     (int)FeatureType.Profile,
                     FeatureType.Profile.GetDescription(),
                     "Funcionalidad para gestionar el perfil del usuario autenticado",
                     (int)ModuleType.Management,
                     140,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Users,
                     FeatureType.Users.GetDescription(),
                     "Funcionalidad para gestionar los usuarios",
                     (int)ModuleType.Management,
                     150,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Stores,
                     FeatureType.Stores.GetDescription(),
                     "Funcionalidad para gestionar las tiendas",
                     (int)ModuleType.Management,
                     160,
                     true,
                     true
                 ),
                 Feature.Create(
                     (int)FeatureType.Configurations,
                     FeatureType.Configurations.GetDescription(),
                     "Funcionalidad para gestionar las configuraciones",
                     (int)ModuleType.Management,
                     170,
                     true,
                     true
                 ),

                //Expenses
                Feature.Create(
                     (int)FeatureType.TodayExpenses,
                     FeatureType.TodayExpenses.GetDescription(),
                     "Funcionalidad para gestionar los gastos del día",
                     (int)ModuleType.Expenses,
                     180,
                     true,
                     true
                 ),

                //Billing
                Feature.Create(
                     (int)FeatureType.Billing,
                     FeatureType.Billing.GetDescription(),
                     "Funcionalidad para generar facturas",
                     (int)ModuleType.Billing,
                     190,
                     true,
                     true
                 ),
                Feature.Create(
                     (int)FeatureType.StorePayment,
                     FeatureType.StorePayment.GetDescription(),
                     "Funcionalidad para registrar pagos de tiendas",
                     (int)ModuleType.Billing,
                     191,
                     true,
                     true
                 ),

                //Histories
                Feature.Create(
                     (int)FeatureType.SalesHistory,
                     FeatureType.SalesHistory.GetDescription(),
                     "Funcionalidad para listar el historial de las ventas",
                     (int)ModuleType.Histories,
                     200,
                     true,
                     true
                 ),
                Feature.Create(
                     (int)FeatureType.EntriesHistory,
                     FeatureType.EntriesHistory.GetDescription(),
                     "Funcionalidad para listar el historial de las entradas",
                     (int)ModuleType.Histories,
                     210,
                     true,
                     true
                 ),
                Feature.Create(
                     (int)FeatureType.ExpensesHistory,
                     FeatureType.ExpensesHistory.GetDescription(),
                     "Funcionalidad para listar el historial de los gastos",
                     (int)ModuleType.Histories,
                     220,
                     true,
                     true
                 ),
                Feature.Create(
                     (int)FeatureType.CreditsHistory,
                     FeatureType.CreditsHistory.GetDescription(),
                     "Funcionalidad para listar el historial de los créditos",
                     (int)ModuleType.Histories,
                     220,
                     true,
                     true
                 ),

                //Credits
                Feature.Create(
                     (int)FeatureType.CreditSale,
                     FeatureType.CreditSale.GetDescription(),
                     "Funcionalidad para hacer ventas a crédito",
                     (int)ModuleType.Credits,
                     230,
                     true,
                     true
                 )
            );
        }
    }
}
