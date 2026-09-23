using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.SwitchMyStore;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.SwitchMyStore;

/// <summary>
/// Tests for SwitchMyStoreCommandHandler (seamless-store-switch v2) covering
/// access control, persistence, and the target-DEK-wrap contract the frontend
/// unwraps with its in-memory current DEK (dek-unwrap.ts unwrapDekWithDek).
/// </summary>
public class SwitchMyStoreCommandHandlerTests
{
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IUserRepository> _mockUserRepository;
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStoreDataKeyProvider> _mockDataKeyProvider;
    private readonly Mock<IStoreKeyWrapService> _mockKeyWrapService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly SwitchMyStoreCommandHandler _handler;

    private static readonly Guid PreviousStoreId = Guid.NewGuid();
    private static readonly Guid TargetStoreId = Guid.NewGuid();
    private static readonly byte[] PreviousDek = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();
    private static readonly byte[] TargetDek = Enumerable.Range(0, 32).Select(i => (byte)(i + 1)).ToArray();

    public SwitchMyStoreCommandHandlerTests()
    {
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockUserRepository = new Mock<IUserRepository>();
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockDataKeyProvider = new Mock<IStoreDataKeyProvider>();
        _mockKeyWrapService = new Mock<IStoreKeyWrapService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockLocalizer
            .Setup(x => x["Forbidden"])
            .Returns(new LocalizedString("Forbidden", "Forbidden"));

        _mockDataKeyProvider
            .Setup(x => x.GetDek(PreviousStoreId))
            .Returns(PreviousDek);
        _mockDataKeyProvider
            .Setup(x => x.GetDek(TargetStoreId))
            .Returns(TargetDek);

        _handler = new SwitchMyStoreCommandHandler(
            _mockHttpContextService.Object,
            _mockUserRepository.Object,
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockDataKeyProvider.Object,
            _mockKeyWrapService.Object,
            _mockLocalizer.Object,
            Mock.Of<ILogger<SwitchMyStoreCommandHandler>>());
    }

    private User CreateUser(Guid selectedStoreId)
    {
        var user = User.Create(
            Guid.NewGuid(), "testuser", "pass", "Test User", null, null, Guid.NewGuid());
        user.SelectedStoreId = selectedStoreId;
        return user;
    }

    private void SetupAccessibleStores(User user, params Store[] stores)
    {
        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(Guid.NewGuid().ToString());
        _mockHttpContextService
            .Setup(x => x.IsSuperAdmin)
            .Returns(false);
        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(user);
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(stores.ToList());
    }

    private static Store StoreWithId(Guid id)
    {
        // Entity<TId>.Id es init-only: Store.Create no acepta Id explícito, así
        // que se fija por reflexión (el handler compara Ids de tiendas).
        var store = Store.Create($"Tienda {id:N}", Guid.NewGuid(), true, Guid.NewGuid());
        typeof(Domain.Common.Entities.Entity<Guid>)
            .GetProperty(nameof(Domain.Common.Entities.Entity<Guid>.Id))
            ?.SetValue(store, id);
        return store;
    }

    #region Error Handling Tests

    [Fact]
    public async Task Handle_WhenUserIsNull_ShouldThrowForbidden()
    {
        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(Guid.NewGuid().ToString());
        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((User?)null);

        Func<Task> act = async () =>
            await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Handle_WhenUserDoesNotHaveAccessToStore_ShouldThrowForbidden()
    {
        SetupAccessibleStores(CreateUser(PreviousStoreId));

        Func<Task> act = async () =>
            await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
    }

    #endregion

    #region Happy Path Tests

    [Fact]
    public async Task Handle_WithValidSwitch_ShouldPersistSelectionAndReturnWrap()
    {
        var user = CreateUser(PreviousStoreId);
        SetupAccessibleStores(user, StoreWithId(TargetStoreId));
        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _mockKeyWrapService
            .Setup(x => x.WrapDek(It.IsAny<string>(), It.IsAny<byte[]>()))
            .Returns(new WrappedDekResult("wrapped", "salt", "iv", 210_000));

        var result = await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Changed.Should().BeTrue();
        result.Data.WrappedDek.Should().NotBeEmpty();
        result.Data.WrapSalt.Should().NotBeEmpty();
        result.Data.WrapIv.Should().NotBeEmpty();
        user.SelectedStoreId.Should().Be(TargetStoreId);
        _mockUserRepository.Verify(x => x.UpdateAsync(user), Times.Once);
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldWrapTargetDekUnderCurrentDekBase64Text()
    {
        // The frontend's unwrapDekWithDek mirrors THIS exact KEK input:
        // PBKDF2 over the UTF-8 bytes of the current DEK's base64 TEXT.
        var user = CreateUser(PreviousStoreId);
        SetupAccessibleStores(user, StoreWithId(TargetStoreId));
        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _mockKeyWrapService
            .Setup(x => x.WrapDek(It.IsAny<string>(), It.IsAny<byte[]>()))
            .Returns(new WrappedDekResult("wrapped", "salt", "iv", 210_000));

        await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        _mockKeyWrapService.Verify(
            x => x.WrapDek(Convert.ToBase64String(PreviousDek), TargetDek),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WhenReSelectingCurrentStore_ShouldNotPersistAndReturnEmptyWrap()
    {
        var user = CreateUser(TargetStoreId);
        SetupAccessibleStores(user, StoreWithId(TargetStoreId));

        var result = await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Changed.Should().BeFalse();
        result.Data.WrappedDek.Should().BeEmpty();
        _mockUserRepository.Verify(x => x.UpdateAsync(It.IsAny<User>()), Times.Never);
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenSuperAdmin_BypassesStoreAccessCheck()
    {
        var user = CreateUser(PreviousStoreId);
        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(Guid.NewGuid().ToString());
        _mockHttpContextService
            .Setup(x => x.IsSuperAdmin)
            .Returns(true);
        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(user);
        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _mockKeyWrapService
            .Setup(x => x.WrapDek(It.IsAny<string>(), It.IsAny<byte[]>()))
            .Returns(new WrappedDekResult("wrapped", "salt", "iv", 210_000));

        var result = await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    #endregion

    #region Degradation Tests

    [Fact]
    public async Task Handle_WhenWrapBuildFails_ShouldStillPersistAndSucceedWithEmptyWrap()
    {
        // The switch itself NEVER fails because of the wrap: the client falls
        // back to its per-store device wrap table (and only then to logout).
        var user = CreateUser(PreviousStoreId);
        SetupAccessibleStores(user, StoreWithId(TargetStoreId));
        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _mockDataKeyProvider
            .Setup(x => x.GetDek(It.IsAny<Guid>()))
            .Throws(new InvalidOperationException("key provider hiccup"));

        var result = await _handler.Handle(new SwitchMyStoreCommand(TargetStoreId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Changed.Should().BeTrue();
        result.Data.WrappedDek.Should().BeEmpty();
        result.Data.WrapSalt.Should().BeEmpty();
        result.Data.WrapIv.Should().BeEmpty();
        user.SelectedStoreId.Should().Be(TargetStoreId);
    }

    #endregion
}
