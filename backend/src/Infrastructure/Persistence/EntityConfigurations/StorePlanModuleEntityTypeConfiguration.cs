using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Plans;
using Domain.Common.Enums;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StorePlanModuleEntityTypeConfiguration : IEntityTypeConfiguration<StorePlanModule>
    {
        private readonly ApplicationDbContext _context;
        public StorePlanModuleEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StorePlanModule> builder)
        {
            builder.HasKey(x => new { x.PlanId, x.ModuleId });

            builder.HasOne(x => x.StorePlan)
                .WithMany(x => x.StorePlanModules)
                .HasForeignKey(x => x.PlanId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.Module)
                .WithMany(x => x.StorePlanModules)
                .HasForeignKey(x => x.ModuleId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasData(
                // Gratis: Ventas, Inventario, Sincronización, Reportes, Gestión
                StorePlanModule.Create((int)StorePlanType.Gratis, (int)ModuleType.Sales),
                StorePlanModule.Create((int)StorePlanType.Gratis, (int)ModuleType.Inventory),
                StorePlanModule.Create((int)StorePlanType.Gratis, (int)ModuleType.Synchronization),
                StorePlanModule.Create((int)StorePlanType.Gratis, (int)ModuleType.Reports),
                StorePlanModule.Create((int)StorePlanType.Gratis, (int)ModuleType.Management),

                // Pago: Gratis + Estadísticas, Ventas Mayoristas, Gastos, Facturación, Historiales, Créditos
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Sales),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Inventory),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Synchronization),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Reports),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Statistics),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Management),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.WholesaleSales),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Expenses),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Billing),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Histories),
                StorePlanModule.Create((int)StorePlanType.Pago, (int)ModuleType.Credits),

                // Superior: todos los módulos AvailableToStore
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Sales),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Inventory),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Synchronization),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Reports),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Statistics),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Management),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.WholesaleSales),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Expenses),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Billing),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Histories),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Credits),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.Warehouses),
                StorePlanModule.Create((int)StorePlanType.Superior, (int)ModuleType.MultiStores),

                // VIP: todos los módulos AvailableToStore
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Sales),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Inventory),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Synchronization),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Reports),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Statistics),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Management),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.WholesaleSales),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Expenses),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Billing),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Histories),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Credits),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.Warehouses),
                StorePlanModule.Create((int)StorePlanType.VIP, (int)ModuleType.MultiStores));
        }
    }
}