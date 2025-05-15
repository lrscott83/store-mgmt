using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Extensions;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Roles;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.EntityConfigurations;
using Infrastructure.Persistence.Outbox;
using Microsoft.EntityFrameworkCore;
using Domain.Entities.Owners;
using Domain.Entities.StoreUsers;
using Domain.Entities.StorePaymentStatuses;
using Domain.Entities.StorePayments;
using Domain.Entities.SystemConfigurations;

namespace Infrastructure.Persistence.Contexts
{
    public sealed class ApplicationDbContext : DbContext
    {
        private const string DefaultConnectionString 
            = "Host=127.0.0.1;Database=smca;Username=postgres;Password=postgres;Persist Security Info=True;Include Error Detail=True";
        private readonly TenantIdProvider _tenantProvider;
        private readonly Guid? _tenantId;
        private readonly IHttpContextService _httpContextService;

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, TenantIdProvider tenantProvider, IHttpContextService httpContextService)
            : base(options)
        {
            ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
            _tenantProvider = tenantProvider;
            _httpContextService = httpContextService;
            //_tenantId = _tenantProvider.GetTenantId();
        }

        internal Guid? TenantId => !string.IsNullOrEmpty(_httpContextService.TenantId) 
            ? _httpContextService.TenantId.ToGuid()
            : null;

        internal bool IsSuperAdmin => _httpContextService.IsSuperAdmin;
        internal bool IsReSeller => _httpContextService.IsReSeller;
        internal Guid CurrentUserId => _httpContextService.UserExternalId.ToGuid();

        //protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        //{
        //    string connectionString = GetTenantConnectionString();

        //    if (string.IsNullOrEmpty(connectionString))
        //        connectionString = DefaultConnectionString;

        //    optionsBuilder.UseNpgsql(connectionString);
        //}

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            //this.SetTenantIdOnCreation(TenantId, IsSuperAdmin);
            this.SetAuditableColumns(CurrentUserId);
            return base.SaveChangesAsync(cancellationToken);
        }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            AddConfiguration(builder);

            //All Decimals will have 18,6 Range
            foreach (var property in builder.Model.GetEntityTypes()
            .SelectMany(t => t.GetProperties())
            .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
            {
                property.SetColumnType("decimal(18,6)");
            }
            base.OnModelCreating(builder);
        }

        private string GetTenantConnectionString()
        {
            var tenant = Tenant.FindAsync(_tenantId).GetAwaiter().GetResult();
            return tenant is not null ? tenant.ConnectionString : string.Empty;
        }

        private void AddConfiguration(ModelBuilder builder)
        {
            builder.ApplyConfiguration(new TenantEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new UserEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new OutboxMessageEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new ModuleEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new FeatureEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new RoleEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new UserRoleEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new StoreEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new StoreModuleEntityTypeConfiguration(this, _httpContextService));
            builder.ApplyConfiguration(new StoreRoleFeatureEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new OwnerEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new StoreUserEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new StorePaymentStatusEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new StorePaymentEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new SystemConfigurationEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new ReSellerEntityTypeConfiguration(this));
            builder.ApplyConfiguration(new ReSellerOwnerEntityTypeConfiguration(this));
            
        }
        internal DbSet<Tenant> Tenant { get; set; }
        internal DbSet<User> User { get; set; }
        internal DbSet<OutboxMessage> OutboxMessage { get; set; }
        internal DbSet<Feature> Feature { get; set; }
        internal DbSet<Module> Module { get; set; }
        internal DbSet<Role> Role { get; set; }
        internal DbSet<Store> Store { get; set; }
        internal DbSet<StoreRoleFeature> StoreRoleFeature { get; set; }
        internal DbSet<StoreModule> StoreModule { get; set; }
        internal DbSet<UserRole> UserRole { get; set; }
        internal DbSet<Owner> Owner { get; set; }
        internal DbSet<StoreUser> StoreUser { get; set; }
        internal DbSet<StorePayment> StorePayment { get; set; }
        internal DbSet<StorePaymentStatus> StorePaymentStatus { get; set; }
        internal DbSet<SystemConfiguration> SystemConfiguration { get; set; }
    }
}
