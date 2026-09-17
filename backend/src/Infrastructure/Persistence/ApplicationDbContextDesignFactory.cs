using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Infrastructure.Persistence
{
    /// <summary>
    /// Design-time factory for `dotnet ef migrations add` (mirrors
    /// DependencyInjection.AddDbContext: Npgsql + MigrationsAssembly).
    /// Not used at runtime.
    /// </summary>
    public sealed class ApplicationDbContextDesignFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
    {
        public ApplicationDbContext CreateDbContext(string[] args)
        {
            DbContextOptionsBuilder<ApplicationDbContext> optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseNpgsql("Host=localhost;Database=design_time;Username=postgres;Password=postgres",
                    b => b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName));

            return new ApplicationDbContext(
                optionsBuilder.Options,
                new TenantIdProvider(new HttpContextAccessor()),
                new DesignTimeHttpContextService());
        }

        private sealed class DesignTimeHttpContextService : IHttpContextService
        {
            public string AccessToken => string.Empty;
            public string UserExternalId => string.Empty;
            public string IPAddress => string.Empty;
            public string GfDevice => string.Empty;
            public string GfDeviceId => string.Empty;
            public string GfSessionId => string.Empty;
            public bool IsSuperAdmin => false;
            public bool IsOwnerAdmin => false;
            public bool IsReSeller => false;
            public bool IsSuperAdminOrOwnerAdmin => IsSuperAdmin || IsOwnerAdmin;
            public string TenantId => string.Empty;
            public string StoreId => string.Empty;
            public Task SignOutAsync() => Task.CompletedTask;
        }
    }
}
