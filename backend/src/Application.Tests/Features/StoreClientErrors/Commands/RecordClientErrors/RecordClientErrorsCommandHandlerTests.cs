using Application.Abstractions.HttpContext;
using Application.Dtos.StoreClientErrors;
using Application.Features.StoreClientErrors.Commands.RecordClientErrors;
using Application.UnitOfWorks;
using Domain.Entities.Stores;
using Domain.Entities.StoreClientErrors;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreClientErrors.Commands.RecordClientErrors;

public class RecordClientErrorsCommandHandlerTests
{
    private static readonly DateTime OccurredAt =
        new(2026, 11, 19, 10, 30, 0, DateTimeKind.Utc);

    private readonly Mock<IStoreClientErrorRepository> _repository = new();
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();

    /// <summary>Las tiendas que el llamador puede tocar. El alta verifica la atribución.</summary>
    private readonly List<Store> _allowedStores = [];

    private readonly Guid _ownerId = Guid.NewGuid();

    public RecordClientErrorsCommandHandlerTests()
    {
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        _httpContextService.Setup(x => x.UserExternalId).Returns(_ownerId.ToString());
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);

        _storeRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(() => _allowedStores);
    }

    private RecordClientErrorsCommandHandler Handler() =>
        new(_repository.Object, _unitOfWork.Object, _httpContextService.Object, _storeRepository.Object);

    /// <summary>Da de alta una tienda del llamador con el id que usará la prueba.</summary>
    private void AllowStore(Guid storeId)
    {
        Store store = Store.Create($"Store-{storeId:N}", _ownerId, true, Guid.NewGuid());
        typeof(Store).GetProperty("Id")!.SetValue(store, storeId);
        _allowedStores.Add(store);
    }

    private static ClientErrorEntryRequest Entry(string message = "boom") => new()
    {
        OccurredAt = OccurredAt,
        Message = message,
    };

    private List<StoreClientError> CaptureSaved()
    {
        var saved = new List<StoreClientError>();
        _repository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreClientError>>()))
            .Callback<IEnumerable<StoreClientError>>(items =>
            {
                saved.Clear();
                saved.AddRange(items);
            });
        return saved;
    }

    [Fact]
    public async Task Handle_WithEntries_PersistsEveryEntryWithItsFields()
    {
        // Arrange
        var saved = CaptureSaved();
        var storeId = Guid.NewGuid();
        AllowStore(storeId);
        var command = new RecordClientErrorsCommand(storeId, new[]
        {
            new ClientErrorEntryRequest
            {
                OccurredAt = OccurredAt,
                Message = "TypeError: cannot read properties of undefined",
                Route = "/sales/new",
                Location = "app/sales/new.tsx:42",
                Count = 3,
                Context = new Dictionary<string, object?> { ["productId"] = "abc" },
                AppVersion = "1.4.2",
                Device = "Android 14 / POS-01",
            },
            new ClientErrorEntryRequest
            {
                OccurredAt = OccurredAt,
                Message = "NetworkError when attempting to fetch resource",
            },
        });

        // Act
        var result = await Handler().Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        saved.Should().HaveCount(2);
        saved.Select(x => x.Message).Should().BeEquivalentTo(
            "TypeError: cannot read properties of undefined",
            "NetworkError when attempting to fetch resource");
        saved.Should().OnlyContain(x => x.StoreId == storeId);

        var first = saved[0];
        first.Route.Should().Be("/sales/new");
        first.Location.Should().Be("app/sales/new.tsx:42");
        first.Count.Should().Be(3);
        first.Context.Should().NotBeNull();
        first.Context.Should().Contain("productId");
        first.AppVersion.Should().Be("1.4.2");
        first.Device.Should().Be("Android 14 / POS-01");

        var second = saved[1];
        second.Route.Should().BeNull();
        second.Location.Should().BeNull();
        second.Count.Should().Be(1);
        second.Context.Should().BeNull();

        _repository.Verify(
            x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreClientError>>()), Times.Once);
        _unitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WithMoreThanFiftyEntries_PersistsOnlyTheFirstFifty()
    {
        // Arrange
        var saved = CaptureSaved();
        var storeId = Guid.NewGuid();
        AllowStore(storeId);
        var command = new RecordClientErrorsCommand(
            storeId,
            Enumerable.Range(1, 60).Select(i => Entry($"error {i}")).ToList());

        // Act
        await Handler().Handle(command, CancellationToken.None);

        // Assert
        saved.Should().HaveCount(50);
        saved[0].Message.Should().Be("error 1");
        saved[49].Message.Should().Be("error 50");
    }

    [Fact]
    public async Task Handle_WithLongMessage_TruncatesItToTheEntityLimit()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(
            null,
            new[] { Entry(new string('x', 600)) });

        // Act
        await Handler().Handle(command, CancellationToken.None);

        // Assert
        saved.Should().ContainSingle();
        saved[0].Message.Should().HaveLength(StoreClientError.MessageMaxLength);
    }

    [Fact]
    public async Task Handle_WithEntries_StoresBothInstantsAsUtc()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(
            null,
            new[] { new ClientErrorEntryRequest { OccurredAt = OccurredAt, Message = "boom" } });

        var before = DateTime.UtcNow;

        // Act
        await Handler().Handle(command, CancellationToken.None);

        var after = DateTime.UtcNow;

        // Assert
        saved.Should().ContainSingle();
        saved[0].OccurredAt.Should().Be(OccurredAt);
        saved[0].OccurredAt.Kind.Should().Be(DateTimeKind.Utc);
        saved[0].ReceivedAt.Kind.Should().Be(DateTimeKind.Utc);
        saved[0].ReceivedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }

    [Fact]
    public async Task Handle_WithNullStoreId_PersistsTheEntryWithoutStore()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(null, new[] { Entry() });

        // Act
        var result = await Handler().Handle(command, CancellationToken.None);

        // Assert
        result.Data.Should().BeTrue();
        saved.Should().ContainSingle();
        saved[0].StoreId.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WithEmptyBatch_SucceedsWithoutPersistingAnything()
    {
        // Arrange
        var command = new RecordClientErrorsCommand(Guid.NewGuid(), []);

        // Act
        var result = await Handler().Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeFalse();
        _repository.Verify(
            x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreClientError>>()), Times.Never);
        _unitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }
}
