using Application.Abstractions.HttpContext;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.Features.Management.Users.Queries.GetStoreUsers;
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

namespace Application.Tests.Management.Users.Queries.GetStoreUsers;

/// <summary>
/// GET /api/v1/StoreUsers/list/{includeInactive} declares a CONCRETE list
/// (ResponseResult&lt;List&lt;StoreUserDto&gt;&gt;, StoreUsersController.GetStoreUsersAsync), so the query
/// and its handler must be typed as that list rather than as a bare IEnumerable.
/// </summary>
public class GetStoreUsersQueryHandlerTests
{
    private const string I18nUserNotFound = "UserNotFound";

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    [Fact]
    public async Task Handle_returns_the_declared_concrete_list_for_a_super_admin()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var storeUsers = new List<StoreUser> { CreateStoreUser("first"), CreateStoreUser("second") };
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersIgnoreQueryFiltersAsync(true))
            .ReturnsAsync(storeUsers);
        SetupMapper(mocks, storeUsers);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new GetStoreUsersQuery(true), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        List<StoreUserDto> data = result.Data;
        data.Should().HaveCount(2);
        data.Select(dto => dto.Login).Should().Equal("first", "second");
        mocks.StoreUserRepository.Verify(x => x.GetStoreUsersAsync(It.IsAny<bool>()), Times.Never,
            "a super admin reads across tenants, so the filtered read must not be used");
    }

    [Fact]
    public async Task Handle_uses_the_tenant_filtered_read_for_an_owner_admin()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        var storeUsers = new List<StoreUser> { CreateStoreUser("only") };
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersAsync(false)).ReturnsAsync(storeUsers);
        SetupMapper(mocks, storeUsers);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new GetStoreUsersQuery(false), CancellationToken.None);

        List<StoreUserDto> data = result.Data;
        data.Should().ContainSingle().Which.Login.Should().Be("only");
        mocks.StoreUserRepository.Verify(x => x.GetStoreUsersIgnoreQueryFiltersAsync(It.IsAny<bool>()),
            Times.Never, "an owner admin must never read across tenants");
    }

    [Fact]
    public async Task Handle_throws_bad_request_and_reads_nothing_when_caller_cannot_manage_users()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        var handler = CreateHandler(mocks);

        var act = () => handler.Handle(new GetStoreUsersQuery(true), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);

        mocks.StoreUserRepository.Verify(x => x.GetStoreUsersAsync(It.IsAny<bool>()), Times.Never);
        mocks.StoreUserRepository.Verify(x => x.GetStoreUsersIgnoreQueryFiltersAsync(It.IsAny<bool>()),
            Times.Never);
    }

    private StoreUser CreateStoreUser(string login)
    {
        var user = User.Create(login, "argon2id-placeholder-hash", login.ToUpperInvariant(), null, null, _tenantId);
        var storeUser = StoreUser.Create(user.Id, _storeId, _tenantId);
        storeUser.User = user;
        storeUser.Store = Store.Create("My Store", Guid.NewGuid(), true, _tenantId);
        return storeUser;
    }

    private static void SetupMapper(TestMocks mocks, List<StoreUser> storeUsers)
    {
        var dtos = storeUsers.Select(su => new StoreUserDto
        {
            Login = su.User.Login,
            FullName = su.User.FullName,
            StoreId = su.StoreId,
            IsActive = su.IsActive,
        }).ToList();

        mocks.Mapper
            .Setup(x => x.Map<IEnumerable<StoreUserDto>>(It.IsAny<IEnumerable<StoreUser>>()))
            .Returns(dtos);
    }

    private static TestMocks CreateMocks()
    {
        var mocks = new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            StoreUserRepository = new Mock<IStoreUserRepository>(),
            Mapper = new Mock<IMapper>(),
            Localizer = new Mock<IStringLocalizer<I18n>>(),
        };

        mocks.Localizer.Setup(x => x[I18nUserNotFound])
            .Returns(new LocalizedString(I18nUserNotFound, "User not found"));

        return mocks;
    }

    private static GetStoreUsersQueryHandler CreateHandler(TestMocks mocks)
        => new(
            mocks.HttpContextService.Object,
            mocks.StoreUserRepository.Object,
            mocks.Mapper.Object,
            mocks.Localizer.Object);

    private sealed class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; init; } = null!;
        public Mock<IStoreUserRepository> StoreUserRepository { get; init; } = null!;
        public Mock<IMapper> Mapper { get; init; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; init; } = null!;
    }
}
