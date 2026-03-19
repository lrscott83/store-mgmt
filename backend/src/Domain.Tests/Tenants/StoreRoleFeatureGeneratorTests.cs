using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.StoreRoleFeatures;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Domain.Tests.Tenants;

/// <summary>
/// Unit tests for StoreRoleFeatureGenerator.
/// These tests verify that the generator produces unique StoreRoleFeatures
/// and does not create duplicates that would cause EF Core tracking conflicts.
/// </summary>
public class StoreRoleFeatureGeneratorTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly StoreRoleFeatureGenerator _generator;
    private readonly Guid _testStoreId = Guid.NewGuid();
    private readonly Guid _testTenantId = Guid.NewGuid();

    public StoreRoleFeatureGeneratorTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _generator = new StoreRoleFeatureGenerator(_mockStoreRepository.Object);
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
    /// Example from StoreRoleFeatures.cs:
    /// - CreditsHistoryAdmin: [HasFeature(FeatureType.Sales)]
    /// - SalesHistoryAdmin: [HasFeature(FeatureType.Sales)]
    /// Both have RoleType.OwnerAdmin, so they create duplicate StoreRoleFeatures.
    /// 
    /// This test SHOULD FAIL until the bug is fixed.
    /// </summary>
    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldNOTCreateDuplicateStoreRoleFeatures_WhenMultipleEnumsHaveSameFeatureId()
    {
        // Arrange - Use feature IDs that appear in multiple StoreRoleFeature enum values
        // Based on StoreRoleFeatures.cs analysis:
        // - FeatureType.Sales appears in CreditsHistoryAdmin AND SalesHistoryAdmin
        // - Both have RoleType.OwnerAdmin
        var featureIds = new List<int> { (int)FeatureType.Sales };

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Check for duplicates by composite key
        var duplicates = result
            .GroupBy(srf => new { srf.StoreId, srf.RoleId, srf.FeatureId })
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        // BUG: This assertion SHOULD FAIL because duplicates are created
        duplicates.Should().BeEmpty(
            $"Duplicate StoreRoleFeatures found with keys: {string.Join(", ", duplicates.Select(d => $"({d.StoreId}, {d.RoleId}, {d.FeatureId})")}");
    }

    /// <summary>
    /// BUG TEST: Verifies that all generated StoreRoleFeatures have unique composite keys.
    /// 
    /// EF Core requires that each entity with a composite key has unique values for that key.
    /// This test ensures no duplicates are generated regardless of input.
    /// </summary>
    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldReturnDistinctResults_Always()
    {
        // Arrange - Use ALL feature IDs to maximize chance of finding duplicates
        var allFeatureIds = Enum.GetValues<FeatureType>()
            .Select(f => (int)f)
            .ToList();

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, allFeatureIds);

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

    /// <summary>
    /// BUG TEST: Verifies that no two StoreRoleFeatures have the same (RoleId, FeatureId) pair.
    /// 
    /// The (RoleId, FeatureId) combination must be unique per store because EF Core
    /// uses this as part of the composite key.
    /// </summary>
    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldHaveUniqueRoleIdFeatureIdPairs()
    {
        // Arrange
        var featureIds = new List<int> 
        { 
            (int)FeatureType.Sales, 
            (int)FeatureType.Products,
            (int)FeatureType.Sale
        };

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Each (RoleId, FeatureId) pair should appear exactly once
        var pairs = result.Select(srf => new { srf.RoleId, srf.FeatureId }).ToList();
        var uniquePairs = pairs.Distinct().Count();

        // BUG: Duplicates in (RoleId, FeatureId) would cause EF Core tracking errors
        uniquePairs.Should().Be(pairs.Count,
            $"Found {pairs.Count - uniquePairs} duplicate (RoleId, FeatureId) pairs");
    }

    #endregion

    #region Happy Path Tests

    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldReturnEmptyList_WhenNoFeatureIdsMatch()
    {
        // Arrange - Use invalid feature IDs
        var featureIds = new List<int> { 9999, 8888 };

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.Should().BeEmpty();
    }

    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldReturnEmptyList_WhenFeatureIdsIsEmpty()
    {
        // Arrange
        var featureIds = new List<int>();

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.Should().BeEmpty();
    }

    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldSetCorrectStoreId()
    {
        // Arrange
        var featureIds = new List<int> { (int)FeatureType.Dashboard };

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.Should().AllSatisfy(srf => srf.StoreId.Should().Be(_testStoreId));
    }

    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldSetCorrectTenantId()
    {
        // Arrange
        var featureIds = new List<int> { (int)FeatureType.Dashboard };

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert
        result.Should().AllSatisfy(srf => srf.TenantId.Should().Be(_testTenantId));
    }

    #endregion

    #region Feature-to-Role Mapping Tests

    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldCreateStoreRoleFeature_ForEachRoleInFeature()
    {
        // Arrange - DashboardAdmin has OwnerAdmin role
        var featureIds = new List<int> { (int)FeatureType.Dashboard };

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - DashboardAdmin has RoleType.OwnerAdmin
        result.Should().Contain(srf => srf.RoleId == (int)RoleType.OwnerAdmin);
    }

    [Fact]
    public void GenerateStoreRoleFeaturesAsync_ShouldIncludeSuperAdmin_ForSuperAdminFeature()
    {
        // Arrange
        var featureIds = new List<int> { (int)FeatureType.Owners }; // OwnersAdmin is SuperAdmin + Owners

        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Should include SuperAdmin role
        result.Should().Contain(srf => srf.RoleId == (int)RoleType.SuperAdmin);
    }

    #endregion

    #region Edge Cases Tests

    [Theory]
    [InlineData(new int[] { 1, 2, 3 })]
    [InlineData(new int[] { (int)FeatureType.Sales, (int)FeatureType.Products })]
    [InlineData(new int[] { (int)FeatureType.Billing, (int)FeatureType.Sale, (int)FeatureType.Products })]
    public void GenerateStoreRoleFeaturesAsync_ShouldHandleVariousFeatureIdCombinations(int[] featureIds)
    {
        // Act
        var result = _generator.GenerateStoreRoleFeaturesAsync(_testStoreId, _testTenantId, featureIds);

        // Assert - Should not throw and should return valid results
        result.Should().NotBeNull();
    }

    #endregion
}
