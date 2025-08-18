using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Modules;
using Domain.Common.Enums;
using Domain.Common.Extensions;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ModuleEntityTypeConfiguration : IEntityTypeConfiguration<Module>
    {
        private readonly ApplicationDbContext _context;
        public ModuleEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Module> builder)
        {
            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.Features)
              .WithOne(e => e.Module)
              .HasForeignKey(e => e.ModuleId)
              .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.StoreModules)
               .WithOne(e => e.Module)
               .HasForeignKey(x => x.ModuleId)
               .OnDelete(DeleteBehavior.Restrict);

            builder.HasData(
                Module.Create(
                    (int)ModuleType.Administration,
                    ModuleType.Administration.GetDescription(),
                    0,
                    priceIncluded: false,
                    float.MaxValue,
                    availableToStore: false,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Sales,
                    ModuleType.Sales.GetDescription(),
                    10,
                    priceIncluded: true,
                    1000,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Inventory,
                    ModuleType.Inventory.GetDescription(),
                    20,
                    priceIncluded: false,
                    1000,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Synchronization,
                    ModuleType.Synchronization.GetDescription(),
                    30,
                    priceIncluded: false,
                    1000,
                    0,
                    0,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Reports,
                    ModuleType.Reports.GetDescription(),
                    40,
                    priceIncluded: false,
                    1000,
                    availableToStore: true,
                    isActive: true
                ),
                Module.Create(
                    (int)ModuleType.Statistics,
                    ModuleType.Statistics.GetDescription(),
                    50,
                    priceIncluded: false,
                    1000,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Management,
                    ModuleType.Management.GetDescription(),
                    60,
                    priceIncluded: true,
                    0,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Expenses,
                    ModuleType.Expenses.GetDescription(),
                    60,
                    priceIncluded: false,
                    2000,
                    0,
                    50,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Billing,
                    ModuleType.Billing.GetDescription(),
                    60,
                    priceIncluded: false,
                    2000,
                    0,
                    50,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Histories,
                    ModuleType.Histories.GetDescription(),
                    60,
                    priceIncluded: false,
                    2000,
                    0,
                    50,
                    availableToStore: true,
                    true
                ),
                Module.Create(
                    (int)ModuleType.Credits,
                    ModuleType.Credits.GetDescription(),
                    60,
                    priceIncluded: false,
                    2000,
                    0,
                    50,
                    availableToStore: true,
                    true
                ));
        }
    }
}
