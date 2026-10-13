using System.Net;
using System.Net.Http.Json;
using Application.Dtos.StoreManagement;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E for the SuperAdmin catalog-slug capability: PUT/GET
/// /api/v1/stores/{storeId}/catalog-slug (store-catalog-slug).
///
/// The public slug (/catalog/&lt;slug&gt;) is changed through the API, and the tests pin why that is
/// safe: EVERY public endpoint resolves the store by <c>Store.CatalogSlug</c>, so moving the column
/// moves the whole catalog with it — only the URL changes.
///
/// <para>
///  1. a SuperAdmin sets a slug; it is NORMALIZED and PERSISTED (read back from the DB, not the
///     endpoint's own echo);
///  2. the public catalog resolves the store by the NEW slug — and no longer by the old one;
///  3. a slug another store already uses is refused with 409 and nothing is written;
///  4. a blank slug is refused (400) — a store with a catalog cannot be left without an address;
///  5. an OwnerAdmin is refused 403 and the store is untouched;
///  6. the combined read (GET {storeId}/catalog-template) returns the same slug, because the
///     SuperAdmin editor is one modal.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class StoreCatalogSlugE2ETests
{
    private readonly AppTestFactory _f;
    public StoreCatalogSlugE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object SlugBody(string slug) => new { Slug = slug };

    /// <summary>Reads the persisted slug straight from the database (tenant filters bypassed).</summary>
    private async Task<string?> ReadSlugAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId)
            .Select(s => s.CatalogSlug)
            .SingleAsync();
    }

    /// <summary>A fresh random slug nobody is using (the unique index is global).</summary>
    private static string UniqueSlug() => $"e2e-slug-{Guid.NewGuid():N}";

    // ══════════════════════════════════════════════════════════════════════
    // 1. Set + normalize + persist
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_normalizes_and_persists_the_slug()
    {
        var saLogin = $"slug-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Slug-Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            // Input with accents, spaces and a ñ: none of that is an error, it is normalized.
            var r = await client.PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/catalog-slug",
                SlugBody("Café & Té"));
            r.StatusCode.Should().Be(HttpStatusCode.OK, "the SuperAdmin must be able to set the slug");

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<StoreCatalogSlugDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.CatalogSlug.Should().Be("cafe-te");

            // Persisted, not merely echoed.
            (await ReadSlugAsync(fx.StoreId)).Should().Be("cafe-te");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. The public catalog follows the new slug (and drops the old one)
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task The_public_catalog_resolves_the_store_by_the_new_slug_and_not_the_old_one()
    {
        var saLogin = $"slug-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Slug-Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            var oldSlug = UniqueSlug();
            (await client.PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/catalog-slug", SlugBody(oldSlug)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            var newSlug = UniqueSlug();
            (await client.PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/catalog-slug", SlugBody(newSlug)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            // The PUBLIC catalog is anonymous: a fresh unauthenticated client, exactly like a customer.
            var anon = _f.CreateClient();

            var byNew = await anon.GetAsync($"/api/v1/public/catalog/{newSlug}");
            byNew.StatusCode.Should().NotBe(HttpStatusCode.NotFound,
                "every public endpoint resolves the store by Store.CatalogSlug, so the new slug must find it");

            var byOld = await anon.GetAsync($"/api/v1/public/catalog/{oldSlug}");
            byOld.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "the previous address is no longer a catalog — only the URL changed, not the data");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. A slug another store already uses is refused
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_refuses_a_slug_another_store_already_uses()
    {
        var saLogin = $"slug-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var taken = await StoreSeed.SeedStoreAsync(_f, $"Slug-A-{Guid.NewGuid():N}", approved: true);
        var other = await StoreSeed.SeedStoreAsync(_f, $"Slug-B-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var slug = UniqueSlug();

            (await client.PutAsJsonAsync($"/api/v1/stores/{taken.StoreId}/catalog-slug", SlugBody(slug)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            // Same slug, different store — even written with a different case, it is the same address.
            var conflict = await client.PutAsJsonAsync($"/api/v1/stores/{other.StoreId}/catalog-slug",
                SlugBody(slug.ToUpperInvariant()));

            conflict.StatusCode.Should().Be(HttpStatusCode.Conflict,
                "the slug is globally unique and is never auto-suffixed behind the operator's back");
            (await ReadSlugAsync(other.StoreId)).Should().BeNull("a refused save writes nothing");
            (await ReadSlugAsync(taken.StoreId)).Should().Be(slug, "the holder keeps its address");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, taken);
            await StoreSeed.CleanupStoreFixtureAsync(_f, other);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. A blank slug is refused
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_refuses_a_blank_slug()
    {
        var saLogin = $"slug-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Slug-Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            var r = await client.PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/catalog-slug", SlugBody("   "));

            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await ReadSlugAsync(fx.StoreId)).Should().BeNull("a store with a catalog cannot be left without an address");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. OwnerAdmin is refused (the caller matrix is unchanged)
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task An_owner_admin_is_forbidden_and_the_store_is_untouched()
    {
        var saLogin = $"slug-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: false);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);

            var r = await client.PutAsJsonAsync($"/api/v1/stores/{owner.StoreId}/catalog-slug",
                SlugBody(UniqueSlug()));

            r.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "the public address is a platform decision: SuperAdmin only");
            (await ReadSlugAsync(owner.StoreId)).Should().BeNull("the refusal writes nothing");
        }
        finally
        {
            await StoreSeed.CleanupStoreAsync(_f, owner.StoreId);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 6. The combined read returns the same slug (one modal, two fields)
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Get_catalog_template_also_returns_the_slug()
    {
        var saLogin = $"slug-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Slug-Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var slug = UniqueSlug();
            (await client.PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/catalog-slug", SlugBody(slug)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            var read = await client.GetAsync($"/api/v1/stores/{fx.StoreId}/catalog-template");
            read.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await read.Content.ReadFromJsonAsync<ApiResponse<StoreCatalogTemplateDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.CatalogSlug.Should().Be(slug, "the editor is one modal: template AND slug");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }
}
