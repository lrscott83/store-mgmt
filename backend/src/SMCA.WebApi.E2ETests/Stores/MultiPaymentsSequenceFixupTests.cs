using FluentAssertions;
using Infrastructure.Migrations;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// NEW coverage (2026-09-18) for review finding R3-SequenceFixupUnverified, purely additive:
/// NO existing E2E file is modified (E2E-untouchable rule).
///
/// Migration 20260918131144_Add-MultiPayments-Module-And-Payment-Mirror inserts Module 16 and
/// Feature 44 with explicit ids, which does not advance their identity sequences, and then runs
/// MultiPaymentsModuleBackfill.SequenceFixupsSql to re-seed them. These tests prove BOTH halves:
///
///   SF1  Wiring (no DB): the migration's Up records the shared fix-up SQL verbatim.
///   SF2  Effect (real PostgreSQL): after executing that SQL, the next identity value for
///        Module and Feature cannot collide with the highest seeded Id.
/// </summary>
[Collection("e2e")]
public sealed class MultiPaymentsSequenceFixupTests
{
    private readonly AppTestFactory _f;
    public MultiPaymentsSequenceFixupTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// Exposes the migration's protected <c>Up</c> so the recorded operations can be inspected
    /// without running the migration against a database (and without touching production code).
    /// </summary>
    private sealed class ExposedMigration : AddMultiPaymentsModuleAndPaymentMirror
    {
        public void InvokeUp(MigrationBuilder migrationBuilder) => base.Up(migrationBuilder);
    }

    [Fact]
    public void Migration_Up_records_the_shared_sequence_fixup_sql()
    {
        var builder = new MigrationBuilder("Npgsql.EntityFrameworkCore.PostgreSQL");

        new ExposedMigration().InvokeUp(builder);

        builder.Operations
            .OfType<SqlOperation>()
            .Select(op => op.Sql)
            .Should().Contain(
                MultiPaymentsModuleBackfill.SequenceFixupsSql,
                "the migration must run the exact shared sequence fix-up constant (single source of truth)");
    }

    [Fact]
    public async Task Sequence_fixup_sql_reseeds_module_and_feature_identity_past_seeded_ids()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Act: execute the exact migration SQL against the real smca_test database.
        // It is idempotent (setval to GREATEST(MAX+1, current)), safe even when the
        // migration already ran or other tests inserted catalog rows.
        await db.Database.ExecuteSqlRawAsync(MultiPaymentsModuleBackfill.SequenceFixupsSql);

        // Assert: for BOTH tables the next identity value is strictly beyond the highest
        // seeded Id. NOTE: each assertion consumes one nextval, advancing the sequence by
        // one — acceptable in the test database.
        var nextModuleId = await db.Database
            .SqlQueryRaw<bool>(
                "SELECT (nextval(pg_get_serial_sequence('\"Module\"', 'Id')) > (SELECT MAX(\"Id\") FROM \"Module\")) AS \"Value\"")
            .SingleAsync();
        nextModuleId.Should().BeTrue(
            "the Module identity sequence must be re-seeded past the explicit-id row (module 16)");

        var nextFeatureId = await db.Database
            .SqlQueryRaw<bool>(
                "SELECT (nextval(pg_get_serial_sequence('\"Feature\"', 'Id')) > (SELECT MAX(\"Id\") FROM \"Feature\")) AS \"Value\"")
            .SingleAsync();
        nextFeatureId.Should().BeTrue(
            "the Feature identity sequence must be re-seeded past the explicit-id row (feature 44)");
    }
}
