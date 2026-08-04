using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.SystemConfigurations;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

/// <summary>
/// Pins the three SystemConfiguration rows that drive billing date math, and evicts
/// BillingService's IMemoryCache copies of them, mirroring MutableDateTimeProvider.Pin's
/// disposable shape so both pins read alike at the call site:
///
///     await using var cfg = await BillingConfigSeed.PinAsync(_f);
///     using var clock = _fixture.Clock.Pin(Anchor);
///
/// DueSoonDays (SystemConfigurationType Id 4) has no migration row today — it resolves via
/// SystemConfigurationRepository's fallback. PinAsync restores "row absent" on dispose rather
/// than leaving a permanent row behind, so a future migration that finally inserts Id 4 never
/// collides with a leftover row from this helper.
/// </summary>
public static class BillingConfigSeed
{
    // SystemConfigurationType.TestingPeriodInMonths = 1
    public const int TrialMonths = 1;
    // SystemConfigurationType.PaymentGraceDays = 3
    public const int GraceDays = 5;
    // SystemConfigurationType.DueSoonDays = 4
    public const int DueSoonDays = 5;

    // Must match BillingService.cs:60-62 exactly — duplication is a known, accepted risk
    // (design D3), not fixed here.
    private static readonly string[] CacheKeys = { "TestingPeriodInMonths", "PaymentGraceDays", "DueSoonDays" };

    public static async Task<IAsyncDisposable> PinAsync(
        AppTestFactory factory,
        int trialMonths = TrialMonths,
        int graceDays = GraceDays,
        int dueSoonDays = DueSoonDays)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var snapshot = await SnapshotAsync(db);

        await UpsertAsync(db, SystemConfigurationType.TestingPeriodInMonths, trialMonths);
        await UpsertAsync(db, SystemConfigurationType.PaymentGraceDays, graceDays);
        await UpsertAsync(db, SystemConfigurationType.DueSoonDays, dueSoonDays);

        EvictCache(factory);

        return new PinScope(factory, snapshot);
    }

    private static async Task<Dictionary<int, string?>> SnapshotAsync(ApplicationDbContext db)
    {
        var snapshot = new Dictionary<int, string?>();
        foreach (var id in TrackedIds)
        {
            var row = await db.Set<SystemConfiguration>().AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id);
            // null means the row is absent (this is the case for Id 4 today).
            snapshot[id] = row?.Value;
        }
        return snapshot;
    }

    private static readonly int[] TrackedIds =
    {
        (int)SystemConfigurationType.TestingPeriodInMonths,
        (int)SystemConfigurationType.PaymentGraceDays,
        (int)SystemConfigurationType.DueSoonDays,
    };

    private static async Task UpsertAsync(ApplicationDbContext db, SystemConfigurationType type, int value)
    {
        int id = (int)type;
        var row = await db.Set<SystemConfiguration>().FirstOrDefaultAsync(c => c.Id == id);
        if (row is null)
        {
            db.Set<SystemConfiguration>().Add(SystemConfiguration.Create(id, type.GetDisplayName(), value.ToString()));
        }
        else
        {
            row.Value = value.ToString();
        }
        await db.SaveChangesAsync();
    }

    private static void EvictCache(AppTestFactory factory)
    {
        var cache = factory.Services.GetRequiredService<IMemoryCache>();
        foreach (var key in CacheKeys)
            cache.Remove(key);
    }

    private sealed class PinScope : IAsyncDisposable
    {
        private readonly AppTestFactory _factory;
        private readonly Dictionary<int, string?> _snapshot;

        public PinScope(AppTestFactory factory, Dictionary<int, string?> snapshot)
        {
            _factory = factory;
            _snapshot = snapshot;
        }

        public async ValueTask DisposeAsync()
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            foreach (var (id, value) in _snapshot)
            {
                var row = await db.Set<SystemConfiguration>().FirstOrDefaultAsync(c => c.Id == id);
                if (value is null)
                {
                    // The row was absent before PinAsync ran — restore that, don't leave a
                    // permanent row behind (see the migration-collision trap in the class doc).
                    if (row is not null)
                        db.Set<SystemConfiguration>().Remove(row);
                }
                else if (row is not null)
                {
                    row.Value = value;
                }
            }
            await db.SaveChangesAsync();

            EvictCache(_factory);
        }
    }
}
