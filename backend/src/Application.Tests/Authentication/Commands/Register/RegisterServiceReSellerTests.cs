using Application.Exceptions;
using Domain.Entities.ReSellerOwners;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Moved from RegisterCommandHandlerReSellerTests. These nine ARE the optional-reSellerLogin
/// contract: null means no Gestor, a value resolves one and links it, and a value that matches
/// nothing is tolerated rather than fatal.
/// </summary>
public class RegisterServiceReSellerTests : RegisterServiceTestFixture
{
    [Fact]
    public async Task RegisterAsync_WithNullReSellerLogin_ShouldSucceed_AndNotCallReSellerRepository()
    {
        var owner = await RegisterAsync(reSellerLogin: null);

        owner.Should().NotBeNull();
        MockReSellerRepository.Verify(
            x => x.GetByUserNameAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_WithEmptyReSellerLogin_ShouldSucceed_AndNotCallReSellerRepository()
    {
        var owner = await RegisterAsync(reSellerLogin: string.Empty);

        owner.Should().NotBeNull();
        MockReSellerRepository.Verify(
            x => x.GetByUserNameAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_WithValidReSellerLogin_ShouldCreateReSellerOwner()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync(CreateTestReSeller());

        await RegisterAsync(reSellerLogin: "reseller");

        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WithValidReSellerLogin_ShouldSetCorrectDiscountValues()
    {
        var reSeller = CreateTestReSeller();
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync(reSeller);

        await RegisterAsync(reSellerLogin: "reseller");

        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.Is<ReSellerOwner>(rso =>
                rso.DiscountPrice == reSeller.DiscountPrice &&
                rso.PercentDiscountPrice == reSeller.PercentDiscountPrice)), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WithValidReSellerLogin_ShouldUseCorrectTenantId()
    {
        var reSeller = CreateTestReSeller();
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync(reSeller);

        await RegisterAsync(reSellerLogin: "reseller");

        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.Is<ReSellerOwner>(rso => rso.TenantId == TestTenantId)), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WithInvalidReSellerLogin_ShouldSucceed_WithoutCreatingReSellerOwner()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync((Domain.Entities.ReSellers.ReSeller?)null);

        var owner = await RegisterAsync(reSellerLogin: "no-existe");

        owner.Should().NotBeNull();
        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_WithInvalidReSellerLogin_ShouldStillCreateOwnerAndStore()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync((Domain.Entities.ReSellers.ReSeller?)null);

        await RegisterAsync(reSellerLogin: "no-existe");

        MockCreateOwnerService.Verify(
            x => x.CreateOwnerAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
        MockCreateStoreService.Verify(
            x => x.CreateStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<List<int>>()),
            Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WhenReSellerRepositoryThrows_ShouldStillSucceed()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("db down"));

        // A lookup failure must not fail the registration: the owner still gets created and the
        // store with it, just with no Gestor link.
        var owner = await RegisterAsync(reSellerLogin: "reseller");

        owner.Should().NotBeNull();
        MockCreateStoreService.Verify(
            x => x.CreateStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<List<int>>()),
            Times.Once);
        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_WhenReSellerOwnerAddFails_ShouldThrowReSellerAssociationFailed()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync(CreateTestReSeller());
        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .ThrowsAsync(new InvalidOperationException("link failed"));

        var act = async () => await RegisterAsync(reSellerLogin: "reseller");

        (await act.Should().ThrowAsync<ApiException>())
            .Which.AcctionCode.Should().Be("Register.ReSellerAssociationFailed");
    }
}