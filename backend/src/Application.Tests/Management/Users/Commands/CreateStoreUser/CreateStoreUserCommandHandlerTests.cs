using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.Features.Management.Users.Commands.CreateStoreUser;
using Application.UnitOfWorks;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Management.Users.Commands.CreateStoreUser;

/// <summary>
/// The action POST /api/v1/StoreUsers declares a <see cref="StoreUserDto"/> success payload
/// (StoreUsersController.CreateStoreUserAsync), so the handler must return the created store user
/// instead of a bare "did it save" flag. These tests pin that shape plus the untouched 400 gate.
/// </summary>
public class CreateStoreUserCommandHandlerTests
{
    private const string I18nUserNotFound = "UserNotFound";

    private readonly Guid _requestedStoreId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    [Fact]
    public async Task Handle_returns_the_created_store_user_dto()
    {
        var mocks = CreateMocks(out var store);
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HashPasswordService.Setup(x => x.HashPassword("Password123")).Returns("argon2id-hash");
        mocks.PreHashProtector.Setup(x => x.Protect("Password123", It.IsAny<Guid>())).Returns("envelope");

        User? persistedUser = null;
        mocks.UserRepository.Setup(x => x.AddAsync(It.IsAny<User>()))
            .Callback<User>(user => persistedUser = user)
            .ReturnsAsync((User user) => user);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(
            new CreateStoreUserCommand(_requestedStoreId, "cashier@test.com", "Password123", "E2E Store User",
                "+5491122334455", "cashier@test.com", [3]),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();

        StoreUserDto dto = result.Data;
        dto.Should().NotBeNull();
        dto.Login.Should().Be("cashier@test.com");
        dto.FullName.Should().Be("E2E Store User");
        dto.CellPhone.Should().Be("+5491122334455");
        dto.Email.Should().Be("cashier@test.com");
        dto.StoreId.Should().Be(store.Id);
        dto.StoreName.Should().Be(store.Name, "the echo names the store the handler already loaded");
        dto.IsActive.Should().BeTrue();
        dto.Id.Should().NotBe(Guid.Empty);
        dto.Id.Should().Be(persistedUser!.Id, "the DTO id is the id a GET /api/v1/StoreUsers/{id} resolves");
    }

    [Fact]
    public async Task Handle_persists_the_store_user_the_dto_describes()
    {
        var mocks = CreateMocks(out var store);
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HashPasswordService.Setup(x => x.HashPassword("Password123")).Returns("argon2id-hash");
        mocks.PreHashProtector.Setup(x => x.Protect(It.IsAny<string>(), It.IsAny<Guid>())).Returns("envelope");

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(
            new CreateStoreUserCommand(_requestedStoreId, "cashier@test.com", "Password123", "E2E Store User",
                null, null, [3]),
            CancellationToken.None);

        mocks.UserRepository.Verify(x => x.AddAsync(It.Is<User>(u =>
            u.Login == result.Data.Login && u.FullName == result.Data.FullName)), Times.Once);
        mocks.StoreUserRepository.Verify(x => x.AddAsync(It.Is<StoreUser>(su =>
            su.UserId == result.Data.Id && su.StoreId == result.Data.StoreId)), Times.Once);
        mocks.UserRoleRepository.Verify(x => x.AddAsync(It.Is<UserRole>(ur =>
            ur.UserId == result.Data.Id && ur.RoleId == 3)), Times.Once);
        mocks.UnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_throws_bad_request_and_persists_nothing_when_caller_cannot_manage_users()
    {
        var mocks = CreateMocks(out _);
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        var handler = CreateHandler(mocks);

        var act = () => handler.Handle(
            new CreateStoreUserCommand(_requestedStoreId, "cashier@test.com", "Password123", "E2E Store User",
                null, null, [3]),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);

        mocks.UserRepository.Verify(x => x.AddAsync(It.IsAny<User>()), Times.Never);
        mocks.UnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    private TestMocks CreateMocks(out Store store)
    {
        store = Store.Create("My Store", Guid.NewGuid(), true, _tenantId);

        var mocks = new TestMocks
        {
            UnitOfWork = new Mock<IApplicationUnitOfWork>(),
            StoreRepository = new Mock<IStoreRepository>(),
            UserRepository = new Mock<IUserRepository>(),
            StoreUserRepository = new Mock<IStoreUserRepository>(),
            UserRoleRepository = new Mock<IUserRoleRepository>(),
            HttpContextService = new Mock<IHttpContextService>(),
            HashPasswordService = new Mock<IHashPasswordService>(),
            PreHashProtector = new Mock<IOfflinePreHashProtector>(),
            Localizer = new Mock<IStringLocalizer<I18n>>(),
        };

        mocks.StoreRepository.Setup(x => x.GetByIdAsync(_requestedStoreId)).ReturnsAsync(store);
        mocks.UnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        mocks.UserRepository.Setup(x => x.AddAsync(It.IsAny<User>()))
            .ReturnsAsync((User user) => user);
        mocks.StoreUserRepository.Setup(x => x.AddAsync(It.IsAny<StoreUser>()))
            .ReturnsAsync((StoreUser storeUser) => storeUser);
        mocks.UserRoleRepository.Setup(x => x.AddAsync(It.IsAny<UserRole>()))
            .ReturnsAsync((UserRole userRole) => userRole);
        mocks.Localizer.Setup(x => x[I18nUserNotFound])
            .Returns(new LocalizedString(I18nUserNotFound, "User not found"));

        return mocks;
    }

    private static CreateStoreUserCommandHandler CreateHandler(TestMocks mocks)
        => new(
            mocks.UnitOfWork.Object,
            mocks.StoreRepository.Object,
            mocks.UserRepository.Object,
            mocks.StoreUserRepository.Object,
            mocks.HttpContextService.Object,
            mocks.Localizer.Object,
            mocks.UserRoleRepository.Object,
            mocks.HashPasswordService.Object,
            mocks.PreHashProtector.Object);

    private sealed class TestMocks
    {
        public Mock<IApplicationUnitOfWork> UnitOfWork { get; init; } = null!;
        public Mock<IStoreRepository> StoreRepository { get; init; } = null!;
        public Mock<IUserRepository> UserRepository { get; init; } = null!;
        public Mock<IStoreUserRepository> StoreUserRepository { get; init; } = null!;
        public Mock<IUserRoleRepository> UserRoleRepository { get; init; } = null!;
        public Mock<IHttpContextService> HttpContextService { get; init; } = null!;
        public Mock<IHashPasswordService> HashPasswordService { get; init; } = null!;
        public Mock<IOfflinePreHashProtector> PreHashProtector { get; init; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; init; } = null!;
    }
}
