using Application.Abstractions.Storage;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Infrastructure.Storage;
using Infrastructure.Persistence;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Interceptors;
using Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Infrastructure
{
    public static class DependencyInjection
    {
        public static void AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            string? connectionString = configuration.GetConnectionString("Application");
            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseNpgsql(connectionString,
                    b => b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));
            
            //var connectionString = configuration.GetConnectionString("DefaultConnection");
            //Ensure.NotNullOrEmpty(connectionString, message: "Connection string 'DefaultConnection' not found.");

            // Imágenes del catálogo web (módulo 18, plan 2026-09-27): raíz en disco del VPS.
            services.Configure<CatalogImageStorageOptions>(configuration.GetSection("Storage"));
            services.AddSingleton<ICatalogImageStorage, CatalogImageStorage>();

            services.AddSingleton<OutboxMessagesInterceptor>();

            services.AddScoped<UpdateAuditableEntitiesInterceptor>();

            AddRepositories(services);

            //services.AddDbContext<ApplicationDbContext>((sp, options) =>
            //{
            //    options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());

            //    options.UseSqlServer(connectionString);
            //});

            //services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

            //services.AddScoped<ApplicationDbContextInitialiser>();

            //services.AddAuthentication()
            //    .AddBearerToken(IdentityConstants.BearerScheme);

            //services.AddAuthorizationBuilder();

            //services
            //    .AddIdentityCore<ApplicationUser>()
            //    .AddRoles<IdentityRole>()
            //    .AddEntityFrameworkStores<ApplicationDbContext>()
            //    .AddApiEndpoints();

            //services.AddSingleton(TimeProvider.System);
            //services.AddTransient<IIdentityService, IdentityService>();

            //services.AddAuthorization(options =>
            //    options.AddPolicy(Policies.CanPurge, policy => policy.RequireRole(Roles.Administrator)));

            services.AddScoped<IApplicationUnitOfWork, ApplicationUnitOfWork>();
        }

        private static void AddRepositories(IServiceCollection services)
        {
            services.AddScoped<IUserRoleRepository, UserRoleRepository>();
            services.AddScoped<IUserRepository, UserRepository>();
            services.AddScoped<ITenantRepository, TenantRepository>();
            services.AddScoped<IFeatureRepository, FeatureRepository>();
            services.AddScoped<IModuleRepository, ModuleRepository>();
            services.AddScoped<IPlanRepository, PlanRepository>();
            services.AddScoped<IStoreModuleRepository, StoreModuleRepository>();
            services.AddScoped<IStoreRepository, StoreRepository>();
            services.AddScoped<IStoreUserRepository, StoreUserRepository>();
            services.AddScoped<IRoleRepository, RoleRepository>();
            services.AddScoped<IStoreRoleFeatureRepository, StoreRoleFeatureRepository>();
            services.AddScoped<IOwnerRepository, OwnerRepository>();
            services.AddScoped<IStorePaymentStatusRepository, StorePaymentStatusRepository>();
            services.AddScoped<IStorePaymentRepository, StorePaymentRepository>();
            services.AddScoped<ISystemConfigurationRepository, SystemConfigurationRepository>();
            services.AddScoped<IReSellerRepository, ReSellerRepository>();
            services.AddScoped<IReSellerOwnerRepository, ReSellerOwnerRepository>();
            services.AddScoped<IOrderRepository, OrderRepository>();
            services.AddScoped<IOrderItemRepository, OrderItemRepository>();
            services.AddScoped<IProductCategoryRepository, ProductCategoryRepository>();
            services.AddScoped<IProductRepository, ProductRepository>();
            services.AddScoped<IProductImageRepository, ProductImageRepository>();
            services.AddScoped<IInventoryEntryRepository, InventoryEntryRepository>();
            services.AddScoped<IInventoryEntryCostRepository, InventoryEntryCostRepository>();
            services.AddScoped<IStoreUsageRepository, StoreUsageRepository>();
            services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();
            services.AddScoped<IMessageRepository, MessageRepository>();
            services.AddScoped<INotificationRepository, NotificationRepository>();
            // Pedidos online (pedidos-whatsapp-persistencia, F2). El POS NO pasa por aquí (D14).
            services.AddScoped<IStoreCatalogSettingsRepository, StoreCatalogSettingsRepository>();
            // Showcase del catálogo público (carrusel e imágenes del día). También es catálogo, no POS.
            services.AddScoped<IStoreCatalogImageRepository, StoreCatalogImageRepository>();
            services.AddScoped<IDeliveryDriverRepository, DeliveryDriverRepository>();
        }
    }
}
