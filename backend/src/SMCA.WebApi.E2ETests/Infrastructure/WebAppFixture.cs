using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class WebAppFixture : IAsyncLifetime
{
    public AppTestFactory Factory { get; private set; } = default!;

    public MutableDateTimeProvider Clock => Factory.Clock;

    public async Task InitializeAsync()
    {
        // Set the connection string override BEFORE creating the factory.
        // Program.cs captures builder.Configuration.GetConnectionString() inline at line 62,
        // which runs before ConfigureWebHost callbacks in the minimal hosting model.
        // Environment variable is the highest-priority config source and is available
        // from the start of WebApplication.CreateBuilder().
        Environment.SetEnvironmentVariable("ConnectionStrings__Application",
            "Host=localhost;Port=5432;Database=smca_test;Username=postgres;Password=postgres;Persist Security Info=True;Include Error Detail=True");

        Factory = new AppTestFactory();
        // Force host build and apply EF migrations to smca_test (env "Testing" skips the app's dev-only auto-migrate).
        // Per-run reset (spec R2): DATA-ONLY cleanup — the database is never dropped (user-approved 2026-08-08).
        // MigrateAsync applies missing migrations + HasData seeds; ResetDataAsync then deletes accumulated
        // test rows in FK order, preserving seed rows. Keeps the User table under the Take(1000) cap.
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();        // apply migrations + HasData seeds
        await DbTestHelpers.ResetDataAsync(db);  // delete accumulated data rows, keep seed rows
    }

    public Task DisposeAsync()
    {
        Factory.Dispose();
        return Task.CompletedTask;
    }
}

[CollectionDefinition("e2e")]
public sealed class E2ECollection : ICollectionFixture<WebAppFixture>;
