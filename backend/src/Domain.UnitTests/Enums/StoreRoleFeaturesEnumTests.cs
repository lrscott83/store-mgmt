using Domain.Common.Attributes;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using FluentAssertions;

namespace Domain.UnitTests.Enums;

/// <summary>
/// Tests to verify that StoreRoleFeatures enum has no duplicate (FeatureType, RoleType) combinations.
/// 
/// DUPLICATE BUG FOUND:
/// - SalesHistoryAdmin (line 108-111): [HasFeature(FeatureType.SalesHistory)] with OwnerAdmin, StoreUser
/// - CreditsHistoryAdmin (line 123-126): [HasFeature(FeatureType.SalesHistory)] with OwnerAdmin, StoreUser
/// 
/// Both create the same (FeatureType.SalesHistory, RoleType.OwnerAdmin) and (FeatureType.SalesHistory, RoleType.StoreUser) combinations!
/// 
/// These tests SHOULD FAIL until the enum is fixed.
/// </summary>
public class StoreRoleFeaturesEnumTests
{
    #region Duplicate Detection Tests

    /// <summary>
    /// BUG TEST: This test verifies that no (FeatureType, RoleType) combination appears more than once.
    /// 
    /// A duplicate occurs when two StoreRoleFeatures enum values have:
    /// - The same FeatureType
    /// - The same RoleType
    /// 
    /// This causes EF Core tracking conflicts when generating StoreRoleFeatures.
    /// </summary>
    [Fact]
    public void StoreRoleFeatures_ShouldHaveNoDuplicateFeatureAndRoleCombinations()
    {
        // Arrange - Get all StoreRoleFeatures that have both a feature and roles
        var allFeatureRoleCombinations = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Select(srf => new
            {
                StoreRoleFeature = srf,
                FeatureType = srf.GetFeatureType(),
                Roles = srf.GetRoles()
            })
            .Where(x => x.FeatureType.HasValue && x.Roles.Any())
            .SelectMany(x => x.Roles.Select(role => new
            {
                StoreRoleFeatureName = x.StoreRoleFeature.ToString(),
                FeatureType = x.FeatureType!.Value,
                RoleType = role
            }))
            .ToList();

        // Act - Find duplicates
        var duplicates = allFeatureRoleCombinations
            .GroupBy(x => new { x.FeatureType, x.RoleType })
            .Where(g => g.Count() > 1)
            .SelectMany(g => g.Select(x => $"{x.StoreRoleFeatureName} and {g.Skip(1).First().StoreRoleFeatureName} both have FeatureType.{x.FeatureType} with RoleType.{x.RoleType}"))
            .ToList();

        // Assert - No duplicates should exist
        duplicates.Should().BeEmpty(
            $"Found duplicate (FeatureType, RoleType) combinations in StoreRoleFeatures enum:\n" +
            string.Join("\n", duplicates.Select(d => $"  - {d}")));
    }

    /// <summary>
    /// BUG TEST: Verifies that FeatureType.SalesHistory doesn't appear in multiple StoreRoleFeatures with the same roles.
    /// </summary>
    [Fact]
    public void StoreRoleFeatures_ShouldNotHaveSalesHistoryWithDuplicateRoles()
    {
        // Arrange
        var featureId = (int)FeatureType.SalesHistory;

        var storeFeaturesWithSalesHistory = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => srf.HasFeature(featureId))
            .ToList();

        // Get all (RoleType) for SalesHistory
        var allRolesForSalesHistory = storeFeaturesWithSalesHistory
            .SelectMany(srf => srf.GetRoles())
            .Distinct()
            .ToList();

        // Act - Count how many times each role appears
        var roleAppearances = storeFeaturesWithSalesHistory
            .SelectMany(srf => srf.GetRoles().Select(role => new { Role = role, StoreFeature = srf.ToString() }))
            .GroupBy(x => x.Role)
            .Where(g => g.Count() > 1)
            .Select(g => new
            {
                Role = g.Key,
                Count = g.Count(),
                Features = g.Select(x => x.StoreFeature).ToList()
            })
            .ToList();

        // Assert - Each role should appear exactly once across all features using SalesHistory
        var duplicates = roleAppearances
            .Where(r => r.Count > 1)
            .Select(r => $"{r.Role}: appears in {string.Join(", ", r.Features)}")
            .ToList();

        duplicates.Should().BeEmpty(
            $"FeatureType.SalesHistory is used by multiple StoreRoleFeatures with overlapping roles:\n" +
            string.Join("\n", duplicates.Select(d => $"  - {d}")));
    }

    #endregion

    #region Consistency Tests

    [Fact]
    public void StoreRoleFeatures_WithHasFeature_ShouldHaveValidFeatureType()
    {
        // Arrange & Act
        var featuresWithHasFeature = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => srf.GetFeatureType().HasValue)
            .ToList();

        // Assert
        featuresWithHasFeature.Should().NotBeEmpty("All StoreRoleFeatures should have a HasFeature attribute");
        
        foreach (var srf in featuresWithHasFeature)
        {
            var featureType = srf.GetFeatureType();
            featureType.Should().NotBeNull($"{srf} should have a valid FeatureType");
            ((int)featureType!.Value).Should().BeGreaterThan(0, $"{srf} should have a positive FeatureType value");
        }
    }

    [Fact]
    public void StoreRoleFeatures_WithHasFeature_ShouldHaveValidRoles()
    {
        // Arrange & Act
        var featuresWithHasFeature = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => srf.GetFeatureType().HasValue)
            .ToList();

        // Assert
        foreach (var srf in featuresWithHasFeature)
        {
            var roles = srf.GetRoles();
            roles.Should().NotBeEmpty($"{srf} should have at least one role");
        }
    }

    [Fact]
    public void StoreRoleFeatures_ShouldHaveUniqueFeatureTypesPerEnumValue()
    {
        // Arrange & Act
        var allFeatureTypes = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => srf.GetFeatureType().HasValue)
            .GroupBy(srf => srf)
            .Where(g => g.Count() > 1)
            .ToList();

        // Assert - Each enum value should map to exactly one FeatureType (this should always pass)
        allFeatureTypes.Should().BeEmpty("Each StoreRoleFeatures enum value should have exactly one FeatureType");
    }

    #endregion

    #region All Combinations Test

    [Fact]
    public void StoreRoleFeatures_ShouldListAllUniqueFeatureRoleCombinations()
    {
        // Arrange & Act
        var combinations = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => srf.GetFeatureType().HasValue && srf.GetRoles().Any())
            .SelectMany(srf =>
                srf.GetRoles().Select(role => new
                {
                    Feature = srf.GetFeatureType().Value,
                    Role = role,
                    StoreRoleFeature = srf.ToString()
                }))
            .OrderBy(x => x.Feature)
            .ThenBy(x => x.Role)
            .ToList();

        // Assert - Just verify we got some combinations
        combinations.Should().NotBeEmpty("StoreRoleFeatures should have feature/role combinations");
        
        // Log for debugging
        Console.WriteLine($"Total unique (FeatureType, RoleType) combinations: {combinations.Count}");
        var distinctCombinations = combinations
            .GroupBy(x => new { x.Feature, x.Role })
            .Count();
        Console.WriteLine($"Distinct (FeatureType, RoleType) combinations: {distinctCombinations}");
    }

    #endregion
}
