using Domain.Common.Enums;
using Domain.Common.Extensions;
using FluentAssertions;

namespace Domain.UnitTests.Enums;

/// <summary>
/// Pins the catalog identifiers of the two modules split out of "Catálogo web" (18) on
/// 2026-10-08 — "Pedidos WhatsApp" (19) and "Gestión de Pedidos" (20) — plus the new feature 124.
/// <para>
/// Why these are pinned and not left to a description lookup: the numbers are DATABASE FACTS.
/// They are written as literal primary keys by FeatureEntityTypeConfiguration/ModuleEntityTypeConfiguration
/// HasData (so EF emits InsertData with those ids), they are seeded by the generated
/// scripts/31-*.sql, and they are the values the per-store backfill raw SQL filters on. A renumber
/// would therefore not fail the build — it would silently point the backfill at the wrong module and
/// the production script at the wrong rows. Pinning the ints here is what makes a renumber loud.
/// </para>
/// <para>
/// Also pins the StoreRoleFeatures mapping decided in the same feature (M1–M6):
/// PedidosWhatsAppAdmin (feature 124, module 19, OwnerAdmin only — the config is the owner's),
/// OnlineOrdersAdmin (feature 123) moves from module 18 to module 20, and WebCatalogAdmin
/// (feature 122) stays on module 18. Without a StoreRoleFeatures entry the module is invisible to
/// AllowedFeaturesService and StoreRoleFeatureGenerator (see AGENTS.md, 2026-09-20 gotcha).
/// </para>
/// </summary>
public class PedidosModulesCatalogTests
{
    #region Catalog identifiers

    [Fact]
    public void ModuleType_PedidosWhatsApp_Is19()
    {
        ((int)ModuleType.PedidosWhatsApp).Should().Be(
            19, "module 19 is written as a literal PK by ModuleEntityTypeConfiguration.HasData and filtered by the backfill SQL");
    }

    [Fact]
    public void ModuleType_GestionPedidos_Is20()
    {
        ((int)ModuleType.GestionPedidos).Should().Be(
            20, "module 20 is written as a literal PK by ModuleEntityTypeConfiguration.HasData and filtered by the backfill SQL");
    }

    [Fact]
    public void FeatureType_PedidosWhatsApp_Is124()
    {
        ((int)FeatureType.PedidosWhatsApp).Should().Be(
            124, "feature 124 is written as a literal PK by FeatureEntityTypeConfiguration.HasData and granted by the backfill SQL");
    }

    [Fact]
    public void NewCatalogEntries_KeepTheirDescriptions()
    {
        // The module Name and feature Name/Description are seeded from GetDescription(), so a rename
        // here without a matching migration would write different text in HasData than in the DB.
        ModuleType.PedidosWhatsApp.GetDescription().Should().Be("Pedidos WhatsApp");
        ModuleType.GestionPedidos.GetDescription().Should().Be("Gestión de pedidos");
        FeatureType.PedidosWhatsApp.GetDescription().Should().Be("Pedidos WhatsApp");
    }

    [Fact]
    public void NewCatalogEntries_DoNotCollideWithExistingIds()
    {
        var moduleIds = Enum.GetValues<ModuleType>().Select(m => (int)m).ToList();
        moduleIds.Should().OnlyHaveUniqueItems("ModuleType values are written as literal PKs");

        var featureIds = Enum.GetValues<FeatureType>().Select(f => (int)f).ToList();
        featureIds.Should().OnlyHaveUniqueItems("FeatureType values are written as literal PKs");
    }

    #endregion

    #region StoreRoleFeatures mapping

    [Fact]
    public void PedidosWhatsAppAdmin_MapsFeature124_Module19_AndOwnerAdminOnly()
    {
        var mapping = StoreRoleFeatures.PedidosWhatsAppAdmin;

        mapping.GetFeatureType().Should().Be(FeatureType.PedidosWhatsApp);
        mapping.GetModuleType().Should().Be(ModuleType.PedidosWhatsApp);
        mapping.GetRoles().Should().BeEquivalentTo(
            new[] { RoleType.OwnerAdmin },
            "the WhatsApp number, delivery types, fees, minimums, hours and zones are the owner's config (M4)");
    }

    [Fact]
    public void OnlineOrdersAdmin_MovedFromWebCatalogToGestionPedidos()
    {
        // Feature 123 keeps its roles (OwnerAdmin + StoreUser, D15): attending an order is day-to-day
        // work. Only the MODULE moves — 18 (Catálogo web) → 20 (Gestión de Pedidos), because that is
        // the module that now persists the order and manages the deliveries (M3).
        var mapping = StoreRoleFeatures.OnlineOrdersAdmin;

        mapping.GetFeatureType().Should().Be(FeatureType.OnlineOrders);
        mapping.GetModuleType().Should().Be(ModuleType.GestionPedidos);
        mapping.GetRoles().Should().BeEquivalentTo(new[] { RoleType.OwnerAdmin, RoleType.StoreUser });
    }

    [Fact]
    public void WebCatalogAdmin_StaysOnWebCatalog_Feature122_OwnerAdminOnly()
    {
        // Catálogo web (18) keeps the catalog and the brand (M1) — nothing about it moves.
        var mapping = StoreRoleFeatures.WebCatalogAdmin;

        mapping.GetFeatureType().Should().Be(FeatureType.WebCatalog);
        mapping.GetModuleType().Should().Be(ModuleType.WebCatalog);
        mapping.GetRoles().Should().BeEquivalentTo(new[] { RoleType.OwnerAdmin });
    }

    [Fact]
    public void BothNewModules_HaveAtLeastOneStoreRoleFeatureEntry()
    {
        // A module with no StoreRoleFeatures entry is invisible: AllowedFeaturesService resolves
        // FeatureIds only through that enum and StoreRoleFeatureGenerator drops unmapped ids
        // (AGENTS.md, 2026-09-20 — WholesaleSales and MultiStores were both missing for this reason).
        var mappedModules = Enum.GetValues<StoreRoleFeatures>()
            .Select(srf => srf.GetModuleType())
            .Where(m => m.HasValue)
            .Select(m => m!.Value)
            .ToList();

        mappedModules.Should().Contain(ModuleType.PedidosWhatsApp);
        mappedModules.Should().Contain(ModuleType.GestionPedidos);
    }

    #endregion
}