using Application.Features.Authentication.Commands.Register;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.Users;
using FluentAssertions;
using Moq;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests for RegisterCommandHandler covering ReSeller referral code scenarios.
/// </summary>
public class RegisterCommandHandlerReSellerTests : RegisterCommandHandlerTestFixture
{
    #region ReSeller Code Null/Empty Tests

    [Fact]
    public async Task Handle_WithNullCode_ShouldSucceed_AndNotCallReSellerRepository()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerRepository.Verify(x => x.GetByUserNameAsync(It.IsAny<string>()), Times.Never);
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithEmptyCode_ShouldSucceed_AndNotCallReSellerRepository()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: "");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerRepository.Verify(x => x.GetByUserNameAsync(It.IsAny<string>()), Times.Never);
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    #endregion

    #region ReSeller Code Found Tests

    [Fact]
    public async Task Handle_WithValidReSellerCode_ShouldCreateReSellerOwner()
    {
        // Arrange
        var handler = CreateHandler();
        var reSellerCode = "VALIDRESELLER";
        var command = CreateValidCommand(code: reSellerCode);
        var reSeller = CreateTestReSeller();

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(reSellerCode))
            .ReturnsAsync(reSeller);

        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .ReturnsAsync((ReSellerOwner rso) => rso);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(
            It.Is<ReSellerOwner>(rso => 
                rso.ReSellerId == reSeller.Id && 
                rso.OwnerId == TestOwnerId)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithValidReSellerCode_ShouldSetCorrectDiscountValues()
    {
        // Arrange
        var handler = CreateHandler();
        var reSellerCode = "DISCOUNT-RESELLER";
        var command = CreateValidCommand(code: reSellerCode);
        
        // Create a specific reseller with known discount values
        var reSeller = CreateSpecificReSeller(
            discountPrice: 15f,
            percentDiscountPrice: 10f);

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(reSellerCode))
            .ReturnsAsync(reSeller);

        ReSellerOwner? capturedRso = null;
        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .Callback<ReSellerOwner>(rso => capturedRso = rso)
            .ReturnsAsync((ReSellerOwner rso) => rso);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedRso.Should().NotBeNull();
        capturedRso!.DiscountPrice.Should().Be(15f);
        capturedRso.PercentDiscountPrice.Should().Be(10f);
    }

    [Fact]
    public async Task Handle_WithValidReSellerCode_ShouldUseCorrectTenantId()
    {
        // Arrange
        var handler = CreateHandler();
        var reSellerCode = "RESELLER123";
        var command = CreateValidCommand(code: reSellerCode);
        var reSeller = CreateTestReSeller();

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(reSellerCode))
            .ReturnsAsync(reSeller);

        ReSellerOwner? capturedRso = null;
        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .Callback<ReSellerOwner>(rso => capturedRso = rso)
            .ReturnsAsync((ReSellerOwner rso) => rso);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedRso.Should().NotBeNull();
        capturedRso!.TenantId.Should().Be(TestTenantId);
    }

    #endregion

    #region ReSeller Code Not Found Tests

    [Fact]
    public async Task Handle_WithInvalidReSellerCode_ShouldSucceed_WithoutCreatingReSellerOwner()
    {
        // Arrange
        var handler = CreateHandler();
        var invalidCode = "NONEXISTENTCODE";
        var command = CreateValidCommand(code: invalidCode);

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(invalidCode))
            .ReturnsAsync(default(ReSeller));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue(
            "Invalid ReSeller code should not fail registration - it's optional");
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithInvalidReSellerCode_ShouldStillCreateOwnerAndStore()
    {
        // Arrange
        var handler = CreateHandler();
        var invalidCode = "INVALID-CODE";
        var command = CreateValidCommand(code: invalidCode);

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(invalidCode))
            .ReturnsAsync(default(ReSeller));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>()), Times.Once);
        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            It.IsAny<Guid>(),
            It.IsAny<Guid>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>(),
            It.IsAny<List<int>>()), Times.Once);
    }

    #endregion

    #region ReSeller Repository Error Tests

    [Fact]
    public async Task Handle_WhenReSellerRepositoryThrows_ShouldStillSucceed()
    {
        // Arrange - Even if reseller lookup fails, registration should proceed
        var handler = CreateHandler();
        var code = "RESELLER123";
        var command = CreateValidCommand(code: code);

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(code))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert - Registration should succeed even if reseller lookup fails
        result.Succeeded.Should().BeTrue(
            "ReSeller lookup failure should not prevent registration");
    }

    [Fact]
    public async Task Handle_WhenReSellerOwnerAddFails_ShouldReturnFailure()
    {
        // Arrange
        var handler = CreateHandler();
        var code = "RESELLER123";
        var command = CreateValidCommand(code: code);
        var reSeller = CreateTestReSeller();

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(code))
            .ReturnsAsync(reSeller);

        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .ThrowsAsync(new InvalidOperationException("Failed to add ReSellerOwner"));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
    }

    #endregion

    #region Helper Methods

    private ReSeller CreateSpecificReSeller(float discountPrice, float percentDiscountPrice)
    {
        var user = User.Create(
            "specific-reseller",
            "hashedpassword",
            "Specific ReSeller User",
            "+0987654321",
            "specific@example.com",
            TestTenantId);

        var resellerId = Guid.NewGuid();
        typeof(Domain.Entities.Users.User)
            .GetProperty("Id")!
            .SetValue(user, resellerId);

        var reSeller = ReSeller.Create(
            resellerId,
            true,
            discountPrice,
            percentDiscountPrice,
            TestTenantId,
            "Specific ReSeller");

        var reSellerGuid = Guid.NewGuid();
        typeof(ReSeller)
            .GetProperty("Id")!
            .SetValue(reSeller, reSellerGuid);

        typeof(ReSeller)
            .GetProperty("User")!
            .SetValue(reSeller, user);

        return reSeller;
    }

    #endregion
}
