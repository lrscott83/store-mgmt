using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Tenants;
using Domain.Entities.StoreRoleFeatures;
using FluentAssertions;

namespace Domain.UnitTests.Tenants;

/// <summary>
/// Unit tests for StoreRoleFeatureGenerator.
/// These tests verify that the generator produces unique StoreRoleFeatures
/// and does not create duplicates that would cause EF Core tracking conflicts.
/// </summary>
public class StoreRoleFeatureGeneratorTests
{
    private readonly StoreRoleFeatureGenerator _generator;

    private readonly Guid _testStoreId = Guid.NewGuid();
    private readonly Guid _testTenantId = Guid.NewGuid();

    public StoreRoleFeatureGeneratorTests()
    {
        // Generator only needs IStoreRepository for constructor signature,
        // but doesn't use it in GenerateStoreRoleFeaturesAsync
        _generator = new StoreRoleFeatureGenerator(null!);
    }

    #region Critical Bug Tests - Duplicate StoreRoleFeatures

    /// <summary>
    /// BUG TEST: This test reproduces the critical production bug that causes container restarts.
    /// 
    /// Error: "The instance of entity type 'StoreRoleFeature' cannot be tracked because 
    /// another instance with the same key value for {'StoreId', 'RoleId', 'FeatureId'} 
    /// is already being tracked."
    /// 
    /// CAUSE: When multiple StoreRoleFeature enum values have the SAME FeatureId,
    /// the generator creates StoreRoleFeatures with duplicate (StoreId, RoleId, FeatureId) keys.
    /// 
    /// Example from StoreRoleFeatures.cs (BUG!):
    /// - Line 108-111: SalesHistoryAdmin has [HasFeature(FeatureType.SalesHistory)] with OwnerAdmin
    /// - Line 123-126: CreditsHistoryAdmin has [HasFeature(FeatureType.SalesHistory)] with OwnerAdmin
    /// BOTH create the same StoreRoleFeature(storeId, OwnerAdmin, SalesHistory, tenantId)!
    /// 
    /// This test SHOULD FAIL until the bug is fixed.
    /// </summary>
    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldNOTCreateDuplicateStoreRoleFeatures_WhenMultipleEnumsHaveSameFeatureId()
    {
        // Arrange - Use SalesHistory (FeatureType = 100) which appears in BOTH SalesHistoryAdmin AND CreditsHistoryAdmin
        // This is the ROOT CAUSE of the production bug!
        var featureIds = new List<int> { (int)FeatureType.SalesHistory };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Check for duplicates by composite key
        var duplicates = result
            .GroupBy(srf => new { srf.StoreId, srf.RoleId, srf.FeatureId })
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        // BUG: This assertion SHOULD FAIL because duplicates ARE created
        // - SalesHistoryAdmin creates (storeId, OwnerAdmin, SalesHistory, tenantId)
        // - CreditsHistoryAdmin creates (storeId, OwnerAdmin, SalesHistory, tenantId)
        // - Same composite key = EF Core tracking conflict!
        duplicates.Should().BeEmpty(
            $"Duplicate StoreRoleFeatures found! Both SalesHistoryAdmin and CreditsHistoryAdmin " +
            $"map to FeatureType.SalesHistory with RoleType.OwnerAdmin, creating duplicate composite keys.");
    }

    /// <summary>
    /// BUG TEST: Verifies that all generated StoreRoleFeatures have unique composite keys.
    /// 
    /// EF Core requires that each entity with a composite key has unique values for that key.
    /// This test ensures no duplicates are generated regardless of input.
    /// </summary>
    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldReturnDistinctResults_Always()
    {
        // Arrange - Use all feature IDs to maximize chance of finding duplicates
        var allFeatureIds = Enum.GetValues<FeatureType>()
            .Select(f => (int)f)
            .ToList();

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, allFeatureIds);

        // Assert
        var distinctCount = result
            .Select(srf => new { srf.StoreId, srf.RoleId, srf.FeatureId })
            .Distinct()
            .Count();

        // BUG: If duplicates exist, distinctCount < result.Count
        distinctCount.Should().Be(result.Count,
            $"Expected {result.Count} distinct StoreRoleFeatures but found only {distinctCount}. " +
            $"Difference of {result.Count - distinctCount} indicates duplicates.");
    }

    #endregion

    #region Happy Path Tests

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldReturnEmptyList_WhenNoFeatureIdsMatch()
    {
        // Arrange - Use invalid feature IDs (negative numbers that don't exist)
        var featureIds = new List<int> { 9999, 8888 };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldReturnEmptyList_WhenFeatureIdsIsEmpty()
    {
        // Arrange
        var featureIds = new List<int>();

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldSetCorrectStoreId()
    {
        // Arrange - DashboardAdmin has OwnerAdmin role
        var featureIds = new List<int> { (int)FeatureType.Dashboard };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.All(srf => srf.StoreId == _testStoreId).Should().BeTrue();
    }

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldSetCorrectTenantId()
    {
        // Arrange
        var featureIds = new List<int> { (int)FeatureType.Dashboard };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.All(srf => srf.TenantId == _testTenantId).Should().BeTrue();
    }

    #endregion

    #region Feature-to-Role Mapping Tests

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldCreateStoreRoleFeature_ForEachRoleInFeature()
    {
        // Arrange - DashboardAdmin has OwnerAdmin role
        var featureIds = new List<int> { (int)FeatureType.Dashboard };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - DashboardAdmin has RoleType.OwnerAdmin
        result.Any(srf => srf.RoleId == (int)RoleType.OwnerAdmin).Should().BeTrue();
    }

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldIncludeSuperAdmin_ForSuperAdminFeature()
    {
        // Arrange - OwnersAdmin has SuperAdmin + ReSeller roles
        var featureIds = new List<int> { (int)FeatureType.Owners };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Should include SuperAdmin role
        result.Any(srf => srf.RoleId == (int)RoleType.SuperAdmin).Should().BeTrue();
    }

    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldCreateMultipleRoles_WhenFeatureHasMultipleRoles()
    {
        // Arrange - ProductsAdmin has OwnerAdmin AND StoreUser roles
        var featureIds = new List<int> { (int)FeatureType.Products };

        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Should have 2 StoreRoleFeatures (one for each role)
        result.Should().HaveCount(2);
        result.Any(srf => srf.RoleId == (int)RoleType.OwnerAdmin).Should().BeTrue();
        result.Any(srf => srf.RoleId == (int)RoleType.StoreUser).Should().BeTrue();
    }

    #endregion

    #region Edge Cases Tests

    [Theory]
    [InlineData(new int[] { 1, 2, 3 })]
    [InlineData(new int[] { (int)FeatureType.Products, (int)FeatureType.Dashboard })]
    [InlineData(new int[] { (int)FeatureType.Billing, (int)FeatureType.Sale, (int)FeatureType.TodayOrders })]
    public async Task GenerateStoreRoleFeaturesAsync_ShouldHandleVariousFeatureIdCombinations(int[] featureIds)
    {
        // Act
        var result = await _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Should not throw and should return valid results
        result.Should().NotBeNull();
        result.All(srf => srf.StoreId == _testStoreId && srf.TenantId == _testTenantId).Should().BeTrue();
    }

    #endregion

    #region F2-R3: la feature 123 (OnlineOrdersAdmin) queda RESUELTA por el generador

    /// <summary>
    /// F2-R3 — el grant de <c>OnlineOrdersAdmin</c> (feature 123) por tienda no tenía ningún test.
    /// Es el que decide que un dueño o un empleado puedan gestionar pedidos, ventas y repartidores:
    /// sin él la feature no aparece en los <c>FeatureIds</c> de <c>/me</c> ni en el roster offline,
    /// y el panel de pedidos queda inalcanzable SIN NINGÚN ERROR visible.
    ///
    /// La pregunta real no es "¿el generador sabe mapear 123?" —eso lo responde cualquier test que le
    /// pase el id— sino "<b>una tienda con el módulo 20 activo</b> recibe ese grant". Y esa pregunta
    /// no la puede responder el generador solo: la lista de featureIds que recibe la produce
    /// <c>AllowedFeaturesService</c>, que se queda con las entradas de <c>StoreRoleFeatures</c> cuyo
    /// <c>[HasModule]</c> está entre los módulos de la tienda. Por eso este test modela esa media
    /// etapa: deriva del propio enum las featureIds que el módulo 20 concede y se las pasa al
    /// generador. Si alguien olvida el <c>[HasModule(ModuleType.GestionPedidos)]</c> —el gotcha de
    /// AGENTS.md del 2026-09-20, que ya costó una vez con WholesaleSales y MultiStores— la lista
    /// queda vacía y el generador no devuelve nada.
    /// </summary>
    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ForAStoreWithTheGestionPedidosModule_ShouldResolveOnlineOrdersForOwnerAdminAndStoreUser()
    {
        // Módulo 20 = "Gestión de pedidos" (2026-10-08: la feature 123 se movió aquí desde el 18).
        List<int> featureIdsOfGestionPedidos = FeaturesGrantedBy(ModuleType.GestionPedidos);

        // Sonda de la sonda: si el módulo 20 no tuviera ninguna entrada, el test de abajo pasaría
        // "perfecto" con una lista vacía. Fijar el par (módulo 20, feature 123) es lo que hace que
        // una mudanza de módulo futura lo rompa en vez de dejarlo pasar en verde.
        featureIdsOfGestionPedidos.Should().Contain((int)FeatureType.OnlineOrders);
        ((int)ModuleType.GestionPedidos).Should().Be(20);
        ((int)FeatureType.OnlineOrders).Should().Be(123);

        var result = await _generator.GenerateStoreRoleFeaturesAsync(
            _testStoreId, _testTenantId, featureIdsOfGestionPedidos);

        // D15: la gestión de pedidos es trabajo del día a día, así que OwnerAdmin Y StoreUser.
        result.Where(srf => srf.FeatureId == (int)FeatureType.OnlineOrders)
            .Select(srf => srf.RoleId)
            .Should().BeEquivalentTo(
                new[] { (int)RoleType.OwnerAdmin, (int)RoleType.StoreUser },
                "OnlineOrdersAdmin lleva [HasRoles(OwnerAdmin, StoreUser)]: el dueño lo gestiona y el empleado lo atiende");
    }

    /// <summary>
    /// El caso que da sentido al de arriba: una tienda SIN el módulo 20 no recibe el grant. El
    /// módulo 18 (Catálogo web) está activo en muchísimas tiendas y NO arrastra la gestión de
    /// pedidos — por eso 123 se movió al 20. Si esta aserción se rompe, es que volvería a colgar de
    /// un módulo que no le toca y el permiso se abriría a tiendas que no lo compraron.
    /// </summary>
    [Fact]
    public async Task GenerateStoreRoleFeaturesAsync_ForAStoreWithoutTheGestionPedidosModule_ShouldNotResolveOnlineOrders()
    {
        List<int> featureIdsOfWebCatalog = FeaturesGrantedBy(ModuleType.WebCatalog);

        var result = await _generator.GenerateStoreRoleFeaturesAsync(
            _testStoreId, _testTenantId, featureIdsOfWebCatalog);

        featureIdsOfWebCatalog.Should().NotBeEmpty("la sonda necesita un módulo con features de verdad");
        result.Should().NotContain(srf => srf.FeatureId == (int)FeatureType.OnlineOrders);
        result.Should().Contain(srf => srf.FeatureId == (int)FeatureType.WebCatalog,
            "control positivo: el módulo 18 sí resuelve su propia feature");
    }

    /// <summary>
    /// Las featureIds que el módulo <paramref name="module"/> concede, según el MISMO criterio que
    /// usa <c>AllowedFeaturesService.GetAllowedFeatureIdsByRoleAsync</c>: entradas de
    /// <c>StoreRoleFeatures</c> con <c>[HasModule]</c> de ese módulo y feature definida. Es el
    /// puente entre "el módulo está activo" y "estas son las features", y por eso se deriva del enum
    /// en vez de escribir la lista a mano: escribirla fijaría la copia, no el contrato.
    /// </summary>
    private static List<int> FeaturesGrantedBy(ModuleType module)
        => Enum.GetValues<StoreRoleFeatures>()
            .Where(roleFeature => roleFeature.GetModuleType() == module && roleFeature.GetFeatureType().HasValue)
            .Select(roleFeature => (int)roleFeature.GetFeatureType()!.Value)
            .ToList();

    #endregion
}
