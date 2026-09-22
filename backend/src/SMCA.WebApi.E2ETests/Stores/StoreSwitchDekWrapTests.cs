using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Application.Abstractions.Authentication;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// seamless-store-switch v2 (PUT /api/v1/stores/switch): the switch persists the
/// selection AND returns the TARGET store's DEK wrapped under the CURRENT
/// store's DEK — the key the client already holds in memory, so an in-session
/// switch never needs a password and never falls back to a logout on devices
/// whose per-store wrap table predates the target store. These facts prove the
/// wire contract end to end: unwrap-with-DEK byte-parity against GetDek, the
/// empty wrap on a no-op re-selection, and the Forbidden for a store the
/// caller does not own. The file is self-contained: local response DTO, local
/// unwrap helper and local second-store seed — no shared fixture file touched.
/// </summary>
[Collection("e2e")]
public sealed class StoreSwitchDekWrapTests
{
    private const string Password = "Password123";
    private const int KekIterations = 210_000;

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public StoreSwitchDekWrapTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Switch_response_wrap_unwraps_with_current_dek_to_target_store_dek()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_factory, withManagementModule: true);
        var secondStoreId = await SeedAdditionalStoreAsync(f.OwnerId, f.TenantId);
        try
        {
            // 1. Login — the client's key material is the SELECTED store's DEK.
            var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });
            loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await loginResponse.Content.ReadFromJsonAsync<ApiResponse<LoginSwitchData>>(ApiResponse.Json);
            loginBody!.Data!.AuthToken.Should().NotBeNullOrEmpty();

            using var request = new HttpRequestMessage(HttpMethod.Put, "/api/v1/stores/switch")
            {
                Content = JsonContent.Create(new { StoreId = secondStoreId })
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", loginBody.Data.AuthToken);

            // 2. The switch — selection persists, response carries the wrap.
            var response = await _client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<SwitchMyStoreWire>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.Changed.Should().BeTrue();
            body.Data.WrappedDek.Should().NotBeNullOrEmpty();
            body.Data.WrapSalt.Should().NotBeNullOrEmpty();
            body.Data.WrapIv.Should().NotBeNullOrEmpty();

            // 3. Server-side verification that the wrap's KEK is exactly the
            //    CURRENT store's DEK (the client-side unwrap path):
            //    PBKDF2 over the UTF-8 bytes of Base64(currentDek), then AES-GCM.
            byte[] currentDek;
            byte[] expectedTargetDek;
            using (var scope = _factory.Services.CreateScope())
            {
                var dataKeyProvider = scope.ServiceProvider.GetRequiredService<IStoreDataKeyProvider>();
                currentDek = dataKeyProvider.GetDek(f.StoreId);
                expectedTargetDek = dataKeyProvider.GetDek(secondStoreId);
            }

            var recovered = UnwrapDekWithDek(currentDek, body.Data.WrappedDek, body.Data.WrapSalt, body.Data.WrapIv);

            recovered.Should().HaveCount(32);
            recovered.Should().BeEquivalentTo(expectedTargetDek);

            // 4. The selection really moved server-side.
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var selected = await db.Set<User>().IgnoreQueryFilters()
                    .Where(u => u.Id == f.UserId)
                    .Select(u => u.SelectedStoreId)
                    .SingleAsync();
                selected.Should().Be(secondStoreId);
            }
        }
        finally
        {
            await CleanupAsync(f.UserId, f.OwnerId, f.StoreId, secondStoreId);
        }
    }

    [Fact]
    public async Task Switch_to_the_current_store_returns_changed_false_and_empty_wrap()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_factory, withManagementModule: true);
        try
        {
            var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });
            var loginBody = await loginResponse.Content.ReadFromJsonAsync<ApiResponse<LoginSwitchData>>(ApiResponse.Json);

            using var request = new HttpRequestMessage(HttpMethod.Put, "/api/v1/stores/switch")
            {
                Content = JsonContent.Create(new { StoreId = f.StoreId })
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Data!.AuthToken);

            var response = await _client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<SwitchMyStoreWire>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Changed.Should().BeFalse();
            body.Data.WrappedDek.Should().BeEmpty();
            body.Data.WrapSalt.Should().BeEmpty();
            body.Data.WrapIv.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(f.UserId, f.OwnerId, f.StoreId, null);
        }
    }

    [Fact]
    public async Task Switch_to_a_store_the_caller_does_not_own_returns_403()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_factory, withManagementModule: true);
        var foreign = await SeedForeignStoreAsync(f.TenantId);
        try
        {
            var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });
            var loginBody = await loginResponse.Content.ReadFromJsonAsync<ApiResponse<LoginSwitchData>>(ApiResponse.Json);

            using var request = new HttpRequestMessage(HttpMethod.Put, "/api/v1/stores/switch")
            {
                Content = JsonContent.Create(new { StoreId = foreign.StoreId })
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Data!.AuthToken);

            var response = await _client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await CleanupAsync(f.UserId, f.OwnerId, f.StoreId, null);
            await CleanupForeignStoreAsync(foreign);
        }
    }

    /// <summary>Second ACTIVE store for the seeded owner — created directly in DB like the seeds do.</summary>
    private async Task<Guid> SeedAdditionalStoreAsync(Guid ownerId, Guid tenantId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = Store.Create($"SW-Store-{Guid.NewGuid():N}", ownerId, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow), storePlanId: (int)StorePlanType.Gratis);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        return store.Id;
    }

    /// <summary>An active store belonging to a DIFFERENT owner — the 403 target.</summary>
    private async Task<(Guid StoreId, Guid OwnerId, Guid UserId)> SeedForeignStoreAsync(Guid tenantId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"fown-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E Foreign Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E foreign owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"FSW-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow), storePlanId: (int)StorePlanType.Gratis);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        return (store.Id, owner.Id, user.Id);
    }

    private async Task CleanupForeignStoreAsync((Guid StoreId, Guid OwnerId, Guid UserId) foreign)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Store>().Where(s => s.Id == foreign.StoreId).ExecuteDeleteAsync();
        await db.Set<Owner>().Where(o => o.Id == foreign.OwnerId).ExecuteDeleteAsync();
        await db.Set<User>().Where(u => u.Id == foreign.UserId).ExecuteDeleteAsync();
    }

    private async Task CleanupAsync(Guid userId, Guid ownerId, params Guid?[] storeIds)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        foreach (var storeId in storeIds.Where(s => s.HasValue).Select(s => s!.Value))
            await db.Set<Store>().Where(s => s.Id == storeId).ExecuteDeleteAsync();
        await db.Set<Owner>().Where(o => o.Id == ownerId).ExecuteDeleteAsync();
        await db.Set<User>().Where(u => u.Id == userId).ExecuteDeleteAsync();
    }

    /// <summary>
    /// Local response DTO mirroring the login wire shape (only the fields used).
    /// </summary>
    private sealed record LoginSwitchData(
        string Login = "",
        string AuthToken = "");

    /// <summary>
    /// Local response DTO mirroring SwitchMyStoreResult — kept in this file so
    /// TestDtos.cs stays untouched (the file-local discipline of the DEK tests).
    /// </summary>
    private sealed record SwitchMyStoreWire(
        bool Changed,
        string WrappedDek = "",
        string WrapSalt = "",
        string WrapIv = "");

    /// <summary>
    /// Mirrors the frontend's unwrapDekWithDek byte for byte: KEK = PBKDF2 over
    /// the UTF-8 bytes of the current DEK's base64 TEXT (the backend wraps with
    /// WrapDek(Convert.ToBase64String(currentDek), targetDek)), then AES-256-GCM.
    /// </summary>
    private static byte[] UnwrapDekWithDek(byte[] currentDek, string wrappedDek, string wrapSalt, string wrapIv)
    {
        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(Convert.ToBase64String(currentDek)),
            Convert.FromBase64String(wrapSalt),
            KekIterations,
            HashAlgorithmName.SHA256,
            32);

        byte[] wrapped = Convert.FromBase64String(wrappedDek);
        byte[] ciphertext = wrapped[..^16];
        byte[] tag = wrapped[^16..];

        byte[] dek = new byte[32];
        using var aesGcm = new AesGcm(kek, 16);
        aesGcm.Decrypt(Convert.FromBase64String(wrapIv), ciphertext, tag, dek);
        return dek;
    }
}
