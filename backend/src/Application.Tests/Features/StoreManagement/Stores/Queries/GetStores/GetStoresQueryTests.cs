using Application.Dtos.StoreManagement;
using Application.Features.StoreManagement.Stores.Queries.GetStores;
using AutoMapper;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreManagement.Stores.Queries.GetStores;

public class GetStoresQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IMapper> _mockMapper;
    private readonly GetStoresQueryHandler _handler;

    public GetStoresQueryHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockMapper = new Mock<IMapper>();
        _handler = new GetStoresQueryHandler(
            _mockStoreRepository.Object,
            _mockMapper.Object);
    }

    [Fact]
    public async Task Handle_returns_mapped_stores()
    {
        // Arrange
        var stores = new List<Store>
        {
            CreateStore("Store 1"),
            CreateStore("Store 2")
        };

        var storeDtos = new List<StoreDto>
        {
            new() { Id = Guid.NewGuid(), Name = "Store 1" },
            new() { Id = Guid.NewGuid(), Name = "Store 2" }
        };

        _mockStoreRepository
            .Setup(x => x.GetStoresAsync(It.IsAny<bool>()))
            .ReturnsAsync(stores);

        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(stores))
            .Returns(storeDtos);

        // Act
        var result = await _handler.Handle(new GetStoresQuery(false), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_includeInactive_true_passes_to_repo()
    {
        // Arrange
        _mockStoreRepository
            .Setup(x => x.GetStoresAsync(It.IsAny<bool>()))
            .ReturnsAsync(new List<Store>());

        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(It.IsAny<IEnumerable<Store>>()))
            .Returns(new List<StoreDto>());

        // Act
        await _handler.Handle(new GetStoresQuery(true), CancellationToken.None);

        // Assert
        _mockStoreRepository.Verify(
            x => x.GetStoresAsync(true),
            Times.Once);
    }

    [Fact]
    public async Task Handle_includeInactive_false_passes_to_repo()
    {
        // Arrange
        _mockStoreRepository
            .Setup(x => x.GetStoresAsync(It.IsAny<bool>()))
            .ReturnsAsync(new List<Store>());

        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(It.IsAny<IEnumerable<Store>>()))
            .Returns(new List<StoreDto>());

        // Act
        await _handler.Handle(new GetStoresQuery(false), CancellationToken.None);

        // Assert
        _mockStoreRepository.Verify(
            x => x.GetStoresAsync(false),
            Times.Once);
    }

    [Fact]
    public async Task Handle_empty_repo_returns_empty()
    {
        // Arrange
        _mockStoreRepository
            .Setup(x => x.GetStoresAsync(It.IsAny<bool>()))
            .ReturnsAsync(new List<Store>());

        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(It.IsAny<IEnumerable<Store>>()))
            .Returns(new List<StoreDto>());

        // Act
        var result = await _handler.Handle(new GetStoresQuery(false), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
    }

    private static Store CreateStore(string name)
    {
        return Store.Create(name, Guid.NewGuid(), true, Guid.NewGuid());
    }
}
