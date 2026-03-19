using Application.Features.Authentication.Commands.Register;
using Application.ResponseModels;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using System.Net;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests to verify proper null handling and error management in RegisterCommandHandler.
/// These tests ensure the handler gracefully handles edge cases without throwing exceptions.
/// </summary>
public class RegisterCommandHandlerErrorHandlingTests : RegisterCommandHandlerTestFixture
{
    #region Null Reference Tests

    /// <summary>
    /// BUG TEST: This test verifies that the handler handles the case when
    /// CreateOwnerService returns an Owner with null User property.
    /// 
    /// Current code does:
    ///     owner.User.SelectedStoreId = store.Id;
    /// 
    /// If owner.User is null, this throws NullReferenceException!
    /// 
    /// This test SHOULD FAIL until proper null checking is added.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldHandleNullOwnerUser_Gracefully()
    {
        // Arrange - Create owner with null User
        var ownerWithNullUser = Owner.Create(
            TestUserId,
            false,
            TestTenantId,
            "Test Owner");
        
        typeof(Owner)
            .GetProperty("Id")!
            .SetValue(ownerWithNullUser, TestOwnerId);
        
        // Explicitly set User to null (simulating edge case)
        ownerWithNullUser.User = null!;

        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>()))
            .ReturnsAsync(ownerWithNullUser);

        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act & Assert
        // The handler should either:
        // 1. Check for null and return a failure result, OR
        // 2. Throw a meaningful exception (not NullReferenceException)
        var action = async () => await handler.Handle(command, CancellationToken.None);
        
        // Current behavior: throws NullReferenceException
        // Expected behavior: returns failure result or specific exception
        await action.Should().NotThrowAsync<NullReferenceException>(
            "Handler should handle null owner.User gracefully, not throw NullReferenceException");
    }

    /// <summary>
    /// BUG TEST: This test verifies that if owner.User is null,
    /// the handler should return a meaningful failure, not crash.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnFailure_WhenOwnerUserIsNull()
    {
        // Arrange
        var ownerWithNullUser = Owner.Create(TestUserId, false, TestTenantId, "Test");
        typeof(Owner).GetProperty("Id")!.SetValue(ownerWithNullUser, TestOwnerId);
        ownerWithNullUser.User = null!;

        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>()))
            .ReturnsAsync(ownerWithNullUser);

        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert - Should return failure, not success
        result.Succeeded.Should().BeFalse(
            "When owner.User is null, registration should fail with meaningful error");
    }

    #endregion

    #region SaveChanges Failure Tests

    /// <summary>
    /// BUG TEST: This test verifies that if SaveChanges fails,
    /// the error message should be meaningful, not generic.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnDescriptiveError_WhenSaveChangesFails()
    {
        // Arrange
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0); // Save fails

        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        
        // The error should NOT just say "The User was not created"
        // It should be more specific or logged for debugging
        var errorCode = result.Errors.FirstOrDefault()?.Code ?? "";
        errorCode.Should().NotBe("Register.Unknown",
            "Error code should not be generic 'Register.Unknown'. Should provide actionable information.");
    }

    #endregion

    #region ReSeller Code Tests

    [Fact]
    public async Task Handle_ShouldFail_WhenReSellerCodeIsProvidedButReSellerNotFound()
    {
        // Arrange
        var command = CreateValidCommand(code: "INVALID_CODE");

        // Don't setup ReSeller lookup - it will return null
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync((Domain.Entities.ReSellers.ReSeller?)null);

        var handler = CreateHandler();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert - Current behavior: Silently continues without ReSeller
        // Expected: Should either fail or have explicit handling
        // This test documents the current behavior for review
        result.Succeeded.Should().BeTrue(
            "Current behavior: Invalid ReSeller code is silently ignored. " +
            "Consider if this is the desired behavior.");
    }

    #endregion
}
