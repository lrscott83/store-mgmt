using Domain.Common.Enums;
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
}
