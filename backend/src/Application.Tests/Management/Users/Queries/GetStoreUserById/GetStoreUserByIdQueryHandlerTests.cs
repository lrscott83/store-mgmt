using Application.Abstractions.HttpContext;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.Features.Management.StoreUsers.Queries.GetStoreUserById;
using Application.Mappings.Management;
using AutoMapper;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Management.Users.Queries.GetStoreUserById;

/// <summary>
/// GET /api/v1/StoreUsers/{id} declares a <see cref="StoreUserDto"/> whose <c>Id</c> the UI uses to
/// act on the row and whose <c>StoreName</c> is the store's name. The profile under test is the real
/// one — a mocked IMapper cannot prove either field is filled.
/// </summary>
public class GetStoreUserByIdQueryHandlerTests
{
    private const string I18nUserNotFound = "UserNotFound";

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    [Fact]
    public async Task Handle_returns_the_user_id_and_the_materialized_store_name()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var storeUser = CreateStoreUser("cashier@test.com", "Tienda Centro");
        mocks.StoreUserRepository.Setup(x => x.GetStoreUserByIdIgnoreQueryFilterAsync(storeUser.UserId))
            .ReturnsAsync(storeUser);
        mocks.StoreUserRepository.Setup(x => x.GetStoreUserByIdAsync(storeUser.UserId))
            .ReturnsAsync(storeUser);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new GetStoreUserByIdQuery(storeUser.UserId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        StoreUserDto dto = result.Data;
        dto.Id.Should().NotBe(Guid.Empty);
        dto.Id.Should().Be(storeUser.UserId, "a store user is resolved by UserId, so that is the id the action accepts");
        dto.StoreName.Should().Be("Tienda Centro");
        dto.StoreId.Should().Be(_storeId);
        dto.Login.Should().Be("cashier@test.com");
    }

    [Fact]
    public async Task Handle_throws_bad_request_and_reads_nothing_when_caller_cannot_manage_users()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        var handler = CreateHandler(mocks);

        var act = () => handler.Handle(new GetStoreUserByIdQuery(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);

        mocks.StoreUserRepository.Verify(x => x.GetStoreUserByIdAsync(It.IsAny<Guid>()), Times.Never);
        mocks.StoreUserRepository.Verify(x => x.GetStoreUserByIdIgnoreQueryFilterAsync(It.IsAny<Guid>()), Times.Never);
    }

    private StoreUser CreateStoreUser(string login, string storeName)
    {
        var user = User.Create(login, "argon2id-placeholder-hash", login.ToUpperInvariant(), null, null, _tenantId);
        var storeUser = StoreUser.Create(user.Id, _storeId, _tenantId);
        storeUser.User = user;
        storeUser.Store = Store.Create(storeName, Guid.NewGuid(), true, _tenantId);
        return storeUser;
    }

    private static GetStoreUserByIdQueryHandler CreateHandler(TestMocks mocks)
        => new(
            mocks.HttpContextService.Object,
            mocks.StoreUserRepository.Object,
            CreateMapper(),
            mocks.Localizer.Object);

    private static IMapper CreateMapper()
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<StoreUserProfile>());
        return config.CreateMapper();
    }

    private static TestMocks CreateMocks()
    {
        var mocks = new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            StoreUserRepository = new Mock<IStoreUserRepository>(),
            Localizer = new Mock<IStringLocalizer<I18n>>(),
        };

        mocks.Localizer.Setup(x => x[I18nUserNotFound])
            .Returns(new LocalizedString(I18nUserNotFound, "User not found"));

        return mocks;
    }

    private sealed class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; init; } = null!;
        public Mock<IStoreUserRepository> StoreUserRepository { get; init; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; init; } = null!;
    }
}
