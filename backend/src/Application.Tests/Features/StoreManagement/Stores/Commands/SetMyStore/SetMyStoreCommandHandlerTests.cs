using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.SetMyStore;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.SetMyStore;

/// <summary>
/// Tests for SetMyStoreCommandHandler covering access control,
/// authorization bypass, and the happy path.
/// </summary>
public class SetMyStoreCommandHandlerTests
{
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IUserRepository> _mockUserRepository;
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly SetMyStoreCommandHandler _handler;

    public SetMyStoreCommandHandlerTests()
    {
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockUserRepository = new Mock<IUserRepository>();
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockLocalizer
            .Setup(x => x["Forbidden"])
            .Returns(new LocalizedString("Forbidden", "Forbidden"));

        _handler = new SetMyStoreCommandHandler(
            _mockHttpContextService.Object,
            _mockUserRepository.Object,
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockLocalizer.Object);
    }

    #region Error Handling Tests

    [Fact]
    public async Task Handle_WhenUserIsNull_ShouldThrowForbidden()
    {
        // Arrange
        var command = new SetMyStoreCommand(Guid.NewGuid());
        var userExternalId = Guid.NewGuid().ToString();

        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(userExternalId);

        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((User?)null);

        // Act
        Func<Task> act = async () => await _handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Handle_WhenUserDoesNotHaveAccessToStore_ShouldThrowForbidden()
    {
        // Arrange
        var command = new SetMyStoreCommand(Guid.NewGuid());
        var userExternalId = Guid.NewGuid().ToString();
        var user = User.Create(
            Guid.NewGuid(), "testuser", "pass", "Test User", null, null, Guid.NewGuid());

        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(userExternalId);

        _mockHttpContextService
            .Setup(x => x.IsSuperAdmin)
            .Returns(false);

        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(user);

        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store>());

        // Act
        Func<Task> act = async () => await _handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
    }

    #endregion

    #region Integration Tests

    [Fact]
    public async Task Handle_WhenSuperAdmin_BypassesStoreAccessCheck()
    {
        // Arrange
        var storeId = Guid.NewGuid();
        var command = new SetMyStoreCommand(storeId);
        var userExternalId = Guid.NewGuid().ToString();
        var user = User.Create(
            Guid.NewGuid(), "testuser", "pass", "Test User", null, null, Guid.NewGuid());

        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(userExternalId);

        _mockHttpContextService
            .Setup(x => x.IsSuperAdmin)
            .Returns(true);

        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(user);

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WithValidSuperAdmin_ShouldReturnSuccess()
    {
        // Arrange
        var storeId = Guid.NewGuid();
        var command = new SetMyStoreCommand(storeId);
        var userExternalId = Guid.NewGuid().ToString();
        var user = User.Create(
            Guid.NewGuid(), "testuser", "pass", "Test User", null, null, Guid.NewGuid());

        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(userExternalId);

        _mockHttpContextService
            .Setup(x => x.IsSuperAdmin)
            .Returns(true);

        _mockUserRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(user);

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeOfType<ResponseResult<bool>>();
        result.Succeeded.Should().BeTrue();
    }

    #endregion
}
