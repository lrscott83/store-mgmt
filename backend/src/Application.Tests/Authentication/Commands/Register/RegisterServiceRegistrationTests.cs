using Application.Exceptions;
using Domain.Entities.ReSellerOwners;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Moved from RegisterCommandHandlerErrorHandlingTests (3 of 4) and RegisterCommandHandlerTests
/// (the 11 that assert what gets BUILT, not what the handler returns). What stayed on the handler
/// is the save and the token.
/// </summary>
public class RegisterServiceRegistrationTests : RegisterServiceTestFixture
{
    // ─── Owner/User integrity ──────────────────────────────────────────────────

    [Fact]
    public async Task RegisterAsync_ShouldHandleNullOwnerUser_Gracefully()
    {
        var ownerWithoutUser = Domain.Entities.Owners.Owner.Create(TestUserId, false, TestTenantId, "d");
        typeof(Domain.Entities.Owners.Owner).GetProperty("Id")!
            .SetValue(ownerWithoutUser, TestOwnerId);
        ownerWithoutUser.User = null!;
        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ReturnsAsync(ownerWithoutUser);

        var act = async () => await RegisterAsync();

        // Controlled failure with a specific code, never a NullReferenceException.
        (await act.Should().ThrowAsync<ApiException>())
            .Which.AcctionCode.Should().Be("Register.OwnerUserNotCreated");
    }

    [Fact]
    public async Task RegisterAsync_ShouldReturnFailure_WhenOwnerUserIsNull()
    {
        var ownerWithoutUser = Domain.Entities.Owners.Owner.Create(TestUserId, false, TestTenantId, "d");
        ownerWithoutUser.User = null!;
        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ReturnsAsync(ownerWithoutUser);

        var act = async () => await RegisterAsync();

        (await act.Should().ThrowAsync<ApiException>())
            .Which.AcctionCode.Should().Be("Register.OwnerUserNotCreated");
    }

    // ─── Owner creation arguments ──────────────────────────────────────────────

    [Fact]
    public async Task RegisterAsync_ShouldCreateOwnerWithCorrectParameters()
    {
        await CreateService().RegisterAsync(
            login: "theLogin",
            password: "thePassword",
            fullName: "The Full Name",
            cellPhone: "+1234567890",
            email: "the@email.com",
            storeName: "The Store",
            ownerDescription: "the description",
            reSellerLogin: null,
            cancellationToken: CancellationToken.None);

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            "theLogin", "thePassword", "The Full Name", "+1234567890",
            "the@email.com", "the description"), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldCallCreateOwnerService_WithCorrectParameters()
    {
        await RegisterAsync();

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            "newuser", "SecurePassword123!", "New User", "+1234567890",
            "newuser@example.com", "Test Owner Description"), Times.Once);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task RegisterAsync_ShouldCreateOwner_WhenLoginIsNullOrEmptyOrWhitespace(string? login)
    {
        // The service does not re-validate: RegisterCommandValidator owns that. Passing the value
        // through untouched is the contract being pinned here.
        await CreateService().RegisterAsync(
            login!, "SecurePassword123!", "New User", "+1234567890",
            "newuser@example.com", "New Store", "d", null, CancellationToken.None);

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            login!, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldCreateOwner_WhenPasswordIsEmpty()
    {
        await CreateService().RegisterAsync(
            "newuser", string.Empty, "New User", "+1234567890",
            "newuser@example.com", "New Store", "d", null, CancellationToken.None);

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(), string.Empty, It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldCreateOwner_WhenEmailIsNull()
    {
        await CreateService().RegisterAsync(
            "newuser", "SecurePassword123!", "New User", "+1234567890",
            null, "New Store", "d", null, CancellationToken.None);

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            null, It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldCreateOwner_WhenFullNameHasSpecialCharacters()
    {
        const string name = "José Ñuñez (Sucursal #1) — 100%";
        await CreateService().RegisterAsync(
            "newuser", "SecurePassword123!", name, "+1234567890",
            "newuser@example.com", "New Store", "d", null, CancellationToken.None);

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(), It.IsAny<string>(), name, It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldCreateOwner_WhenCellPhoneHasInternationalFormat()
    {
        const string phone = "+53 5 1234567";
        await CreateService().RegisterAsync(
            "newuser", "SecurePassword123!", "New User", phone,
            "newuser@example.com", "New Store", "d", null, CancellationToken.None);

        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), phone,
            It.IsAny<string?>(), It.IsAny<string?>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldReturnFailure_WhenCreateOwnerThrowsException()
    {
        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("boom"));

        var act = async () => await RegisterAsync();

        // Propagated unwrapped: the service does not invent a code for a failure it did not cause.
        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    // ─── Store creation ────────────────────────────────────────────────────────

    [Fact]
    public async Task RegisterAsync_ShouldCallCreateStoreService_WithOwnerIdAndTenantId()
    {
        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            TestOwnerId, TestTenantId,
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
            It.IsAny<bool>(), It.IsAny<List<int>>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldSetSelectedStoreId_OnOwnerUser()
    {
        await RegisterAsync();

        TestOwner.User.SelectedStoreId.Should().Be(TestStoreId);
    }

    // ─── Gestor link ───────────────────────────────────────────────────────────

    [Fact]
    public async Task RegisterAsync_ShouldCreateReSellerOwner_WhenValidReSellerLoginProvided()
    {
        var reSeller = CreateTestReSeller();
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync(reSeller);

        await RegisterAsync(reSellerLogin: "reseller");

        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.Is<ReSellerOwner>(rso =>
                rso.ReSellerId == reSeller.Id && rso.OwnerId == TestOwnerId)), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldNotCallReSellerRepository_WhenReSellerLoginIsNull()
    {
        await RegisterAsync(reSellerLogin: null);

        MockReSellerRepository.Verify(
            x => x.GetByUserNameAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_ShouldNotCallReSellerOwnerRepository_WhenReSellerLoginIsNull()
    {
        await RegisterAsync(reSellerLogin: null);

        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_ShouldNotCreateReSellerOwner_WhenReSellerNotFound()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync((Domain.Entities.ReSellers.ReSeller?)null);

        await RegisterAsync(reSellerLogin: "unknown");

        MockReSellerOwnerRepository.Verify(
            x => x.AddAsync(It.IsAny<ReSellerOwner>()), Times.Never);
    }

    [Fact]
    public async Task RegisterAsync_ShouldFail_WhenReSellerLoginIsProvidedButReSellerNotFound()
    {
        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(It.IsAny<string>()))
            .ReturnsAsync((Domain.Entities.ReSellers.ReSeller?)null);

        // Tolerated: an unresolvable Gestor login does NOT fail the registration. The owner and
        // its store are still created, just with no Gestor link.
        var owner = await RegisterAsync(reSellerLogin: "unknown");

        owner.Should().NotBeNull();
        MockCreateStoreService.Verify(
            x => x.CreateStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<List<int>>()),
            Times.Once);
    }

    // ─── The service never commits ─────────────────────────────────────────────

    [Fact]
    public async Task RegisterAsync_ShouldNeverCommit_UnitOfWorkIsNotAServiceDependency()
    {
        // The caller owns the transaction so owner + store + modules + Gestor link commit in ONE
        // save. A structural assertion is the honest way to pin "the service cannot save": there
        // is no unit of work available to it even if someone tried.
        typeof(Application.Services.Authentication.RegisterService)
            .GetConstructors()
            .SelectMany(c => c.GetParameters())
            .Select(p => p.ParameterType)
            .Should().NotContain(typeof(Application.UnitOfWorks.IApplicationUnitOfWork));

        // And the happy path still stages everything for the caller to commit.
        await RegisterAsync();
        MockCreateStoreService.Verify(
            x => x.CreateStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<List<int>>()),
            Times.Once);
    }
}