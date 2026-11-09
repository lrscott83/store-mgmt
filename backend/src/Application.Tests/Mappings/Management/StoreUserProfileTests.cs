using Application.Dtos.Management.StoreUsers;
using Application.Mappings.Management;
using AutoMapper;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using FluentAssertions;

namespace Application.Tests.Mappings.Management;

/// <summary>
/// The store-user card and the get-by-id screen act on a row through <see cref="StoreUserDto.Id"/>
/// and show the store through <see cref="StoreUserDto.StoreName"/>. <see cref="Domain.Entities.StoreUsers.StoreUser"/>
/// has no surrogate key — the repository resolves a row by <c>UserId</c> — so the mapped id must be
/// the user id, and the name must be the store's real name rather than a GUID.
/// </summary>
public class StoreUserProfileTests
{
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    [Fact]
    public void Map_list_carries_the_user_id_and_the_store_name_of_each_row()
    {
        var mapper = CreateMapper();
        var first = CreateStoreUser("first", storeName: "Tienda Centro");
        var second = CreateStoreUser("second", storeName: "Tienda Norte");

        var dtos = mapper.Map<IEnumerable<StoreUserDto>>(new List<StoreUser> { first, second }).ToList();

        dtos.Should().HaveCount(2);
        dtos[0].Id.Should().NotBe(Guid.Empty, "the client needs an identifier to act on the row");
        dtos[0].Id.Should().Be(first.UserId, "a store user is resolved by UserId, so that is the id the API accepts");
        dtos[0].StoreName.Should().Be("Tienda Centro");
        dtos[0].StoreId.Should().Be(_storeId);
        dtos[0].Login.Should().Be("first");
        dtos[1].Id.Should().Be(second.UserId);
        dtos[1].StoreName.Should().Be("Tienda Norte");
    }

    [Fact]
    public void Map_leaves_the_store_name_null_when_the_store_navigation_is_not_loaded()
    {
        var mapper = CreateMapper();
        var storeUser = CreateStoreUser("only", storeName: "Tienda Centro");
        storeUser.Store = null!;

        var dto = mapper.Map<StoreUserDto>(storeUser);

        dto.StoreName.Should().BeNull();
        dto.Id.Should().Be(storeUser.UserId, "the id does not depend on the store navigation");
    }

    private StoreUser CreateStoreUser(string login, string storeName)
    {
        var user = User.Create(login, "argon2id-placeholder-hash", login.ToUpperInvariant(), null, null, _tenantId);
        var storeUser = StoreUser.Create(user.Id, _storeId, _tenantId);
        storeUser.User = user;
        storeUser.Store = Store.Create(storeName, Guid.NewGuid(), true, _tenantId);
        return storeUser;
    }

    private static IMapper CreateMapper()
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<StoreUserProfile>());
        return config.CreateMapper();
    }
}
