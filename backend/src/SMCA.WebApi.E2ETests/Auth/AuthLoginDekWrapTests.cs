using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Application.Abstractions.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreUsers;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// Login delivers the store DEK wrapped with the user's decrypted offline password pre-hash to
/// ANY authenticated user (spec auth-login-wrapped-dek R1-R4). These facts prove byte-parity with
/// the roster wrap (same Unprotect pre-hash, same GetDek), the first-login backfill, and the
/// empty-on-failure degradation. The file is self-contained: local response DTO, local UnwrapDek
/// and a local first-login seed helper — ExportOfflineRosterTests.cs / TestDtos.cs stay untouched.
/// </summary>
[Collection("e2e")]
public sealed class AuthLoginDekWrapTests
{
    private const string Password = "Password123";
    private const int KekIterations = 210_000;

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginDekWrapTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task StoreUser_login_returns_wrapped_dek_byte_equal_to_GetDek()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<LoginDekWrapData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.WrappedDek.Should().NotBeNullOrEmpty();
            body.Data.WrapSalt.Should().NotBeNullOrEmpty();
            body.Data.WrapIv.Should().NotBeNullOrEmpty();

            var recovered = await RecoverDekFromWireAsync(f.UserId, body.Data.WrappedDek, body.Data.WrapSalt, body.Data.WrapIv);

            using var providerScope = _factory.Services.CreateScope();
            var dataKeyProvider = providerScope.ServiceProvider.GetRequiredService<IStoreDataKeyProvider>();
            var expected = dataKeyProvider.GetDek(f.StoreId);

            recovered.Should().HaveCount(32);
            recovered.Should().BeEquivalentTo(expected);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_login_returns_wrapped_dek_byte_equal_to_GetDek()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_factory, withManagementModule: true);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<LoginDekWrapData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.WrappedDek.Should().NotBeNullOrEmpty();
            body.Data.WrapSalt.Should().NotBeNullOrEmpty();
            body.Data.WrapIv.Should().NotBeNullOrEmpty();

            var recovered = await RecoverDekFromWireAsync(f.UserId, body.Data.WrappedDek, body.Data.WrapSalt, body.Data.WrapIv);

            using var providerScope = _factory.Services.CreateScope();
            var dataKeyProvider = providerScope.ServiceProvider.GetRequiredService<IStoreDataKeyProvider>();
            var expected = dataKeyProvider.GetDek(f.StoreId);

            recovered.Should().HaveCount(32);
            recovered.Should().BeEquivalentTo(expected);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task First_login_backfills_prehash_and_returns_wrapped_dek()
    {
        var f = await SeedStoreUserWithoutPreHashAsync();
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<LoginDekWrapData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.WrappedDek.Should().NotBeNullOrEmpty();
            body.Data.WrapSalt.Should().NotBeNullOrEmpty();
            body.Data.WrapIv.Should().NotBeNullOrEmpty();

            // Fresh scope: the wrap fields come from the envelope the login request itself backfilled.
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var preHash = await db.Set<User>().IgnoreQueryFilters()
                    .Where(u => u.Id == f.UserId)
                    .Select(u => u.OfflinePasswordPreHash)
                    .SingleAsync();
                preHash.Should().NotBeNullOrEmpty();
            }
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_login_returns_empty_wrap_fields()
    {
        var login = $"sa-wrap-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, Password);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<LoginDekWrapData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.WrappedDek.Should().BeEmpty();
            body.Data.WrapSalt.Should().BeEmpty();
            body.Data.WrapIv.Should().BeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, saUserId);
        }
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401_without_dek_data()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password = "WrongPassword123!" });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<LoginDekWrapData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Data.Should().BeNull();
            body.Errors.Should().ContainSingle(e => e.Code == "Auth.InvalidCredentials");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    [Fact]
    public async Task Login_to_inactive_store_returns_403_without_dek_data()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null);
        try
        {
            await StoreSeed.DeactivateStoreAsync(_factory, f.StoreId);

            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<LoginDekWrapData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Data.Should().BeNull();
            body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    /// <summary>
    /// Local response DTO mirroring the AuthDto wire shape. Kept in this file so
    /// TestDtos.cs stays untouched (spec auth-login-e2e R1).
    /// </summary>
    private sealed record LoginDekWrapData(
        string Login = "",
        string AuthToken = "",
        DateTime ExpiresIn = default,
        string? RefreshToken = null,
        DateTimeOffset? RefreshTokenExpiresAt = null,
        string WrappedDek = "",
        string WrapSalt = "",
        string WrapIv = "");

    /// <summary>
    /// Recovers the DEK from wire fields only: KEK from the decrypted stored pre-hash
    /// (Unprotect, fresh scope) + salt + the wrap service's fixed 210_000 iterations,
    /// then AES-GCM decrypt. Mirrors ExportOfflineRosterTests.UnwrapDek; the login
    /// response carries no iteration count, so KekIterations is the constant.
    /// </summary>
    private static byte[] UnwrapDek(string storedPasswordHash, string wrappedDek, string wrapSalt, string wrapIv)
    {
        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(storedPasswordHash),
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

    private async Task<byte[]> RecoverDekFromWireAsync(Guid userId, string wrappedDek, string wrapSalt, string wrapIv)
    {
        string storedPasswordHash;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var encryptedPreHash = await db.Set<User>().IgnoreQueryFilters()
                .Where(u => u.Id == userId)
                .Select(u => u.OfflinePasswordPreHash)
                .SingleAsync();
            var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
            storedPasswordHash = preHashProtector.Unprotect(encryptedPreHash, userId)!;
        }
        return UnwrapDek(storedPasswordHash, wrappedDek, wrapSalt, wrapIv);
    }

    /// <summary>
    /// Mirrors AuthzSeed.SeedStoreUserAsync but OMITS OfflinePasswordPreHash so the login
    /// request itself must run the first-login backfill (spec auth-login-wrapped-dek R3).
    /// </summary>
    private async Task<AuthzSeed.StoreUserFixture> SeedStoreUserWithoutPreHashAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var ownerLogin = $"suo-{Guid.NewGuid():N}@test.com";
        var ownerUser = User.Create(ownerLogin, DbTestHelpers.HashPassword(Password), "E2E SU Owner", "0000000000", ownerLogin, tenantId);
        db.Set<User>().Add(ownerUser);
        var owner = Owner.Create(ownerUser.Id, false, tenantId, "E2E SU owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"SU-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, AuthzSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));

        var login = $"suser-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E StoreUser", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();

        return new AuthzSeed.StoreUserFixture(user.Id, login, ownerUser.Id, owner.Id, store.Id, tenantId);
    }
}