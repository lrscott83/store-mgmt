using Application.Abstractions.HttpContext;
using Application.Dtos.StoreClientErrors;
using Application.Features.StoreClientErrors.Commands.RecordClientErrors;
using Application.UnitOfWorks;
using Domain.Entities.StoreClientErrors;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreClientErrors.Commands.RecordClientErrors;

/// <summary>
/// Endurecimiento del alta de errores del POS (hallazgos U1 del seguimiento de
/// `pos-client-error-logs`). Cuatro garantías, y todas se observan por el efecto persistido:
///
///   1. Una tienda que el llamador no puede tocar NO se atribuye: el lote se descarta y el
///      resultado lo dice (`Data == false`). `StoreId` null sigue siendo válido (spec S4).
///   2. El servidor redacta por su cuenta, no confía en la redacción del cliente.
///   3. Un contexto que no se puede serializar deja `Context` en null; nunca tumba el lote.
///   4. El tope de 50 se aplica DESPUÉS de descartar lo inútil, así que un lote con basura delante
///      sigue guardando 50 filas útiles.
/// </summary>
public class RecordClientErrorsHardeningTests
{
    private static readonly DateTime OccurredAt = new(2026, 11, 19, 10, 30, 0, DateTimeKind.Utc);

    private readonly Mock<IStoreClientErrorRepository> _repository = new();
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();
    private readonly Store _ownedStore;
    private readonly Store _otherStore;

    public RecordClientErrorsHardeningTests()
    {
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        _ownedStore = Store.Create("Tienda Centro", _ownerId, true, _tenantId);
        _otherStore = Store.Create("Tienda Ajena", Guid.NewGuid(), true, _tenantId);

        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(_ownerId.ToString());
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);

        _storeRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync([_ownedStore]);
    }

    private RecordClientErrorsCommandHandler Handler() => new(
        _repository.Object,
        _unitOfWork.Object,
        _httpContextService.Object,
        _storeRepository.Object);

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

    private static ClientErrorEntryRequest Entry(string message = "boom") => new()
    {
        OccurredAt = OccurredAt,
        Message = message,
    };

    /// <summary>Un valor que System.Text.Json no puede serializar: su getter lanza.</summary>
    private sealed class UnserializableValue
    {
        public string Value => throw new InvalidOperationException("boom");
    }

    #region Tienda del llamador

    [Fact]
    public async Task Handle_WithAStoreTheCallerCanWrite_PersistsItWithThatStore()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(_ownedStore.Id, new[] { Entry() });

        // Act
        var result = await Handler().Handle(command, CancellationToken.None);

        // Assert
        result.Data.Should().BeTrue();
        saved.Should().ContainSingle();
        saved[0].StoreId.Should().Be(_ownedStore.Id);
    }

    [Fact]
    public async Task Handle_WithAStoreOutsideTheCallerScope_DropsTheBatchWithoutPersisting()
    {
        // Arrange
        var command = new RecordClientErrorsCommand(_otherStore.Id, new[] { Entry() });

        // Act
        var result = await Handler().Handle(command, CancellationToken.None);

        // Assert — la telemetría nunca responde 403, pero el descarte es observable en el valor.
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeFalse();
        _repository.Verify(
            x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreClientError>>()), Times.Never);
        _unitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithNullStoreId_PersistsWithoutAskingForOwnership()
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
        _storeRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()), Times.Never);
    }

    #endregion

    #region Redacción del servidor

    [Fact]
    public async Task Handle_WithSecretsInMessageAndContext_RedactsThemBeforePersisting()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(_ownedStore.Id, new[]
        {
            new ClientErrorEntryRequest
            {
                OccurredAt = OccurredAt,
                Message = "login falló con Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def",
                Location = "app/login.tsx:12",
                Context = new Dictionary<string, object?>
                {
                    ["accessToken"] = "eyJhbGciOiJIUzI1NiJ9.abc.def",
                    ["route"] = "/login",
                },
            },
        });

        // Act
        await Handler().Handle(command, CancellationToken.None);

        // Assert
        saved.Should().ContainSingle();
        saved[0].Message.Should().Be("login falló con Authorization: Bearer [REDACTED]");
        saved[0].Context.Should().NotContain("eyJhbGciOiJIUzI1NiJ9.abc.def");
        saved[0].Context.Should().Contain("[REDACTED]");
        saved[0].Context.Should().Contain("/login");
    }

    [Fact]
    public async Task Handle_WithSecretsInTheOptionalFields_RedactsThemToo()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(_ownedStore.Id, new[]
        {
            new ClientErrorEntryRequest
            {
                OccurredAt = OccurredAt,
                Message = "boom",
                Route = "/sales?token=abc123",
                AppVersion = "1.4.2 Bearer abc.def",
                Device = "Android 14",
            },
        });

        // Act
        await Handler().Handle(command, CancellationToken.None);

        // Assert — solo el texto con `Bearer` se puede limpiar sin inventar reglas.
        saved.Should().ContainSingle();
        saved[0].AppVersion.Should().Be("1.4.2 Bearer [REDACTED]");
        saved[0].Route.Should().Be("/sales?token=abc123");
        saved[0].Device.Should().Be("Android 14");
    }

    #endregion

    #region Contexto no serializable

    [Fact]
    public async Task Handle_WithAnUnserializableContext_PersistsTheEntryWithNullContext()
    {
        // Arrange
        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(_ownedStore.Id, new[]
        {
            new ClientErrorEntryRequest
            {
                OccurredAt = OccurredAt,
                Message = "boom",
                Context = new Dictionary<string, object?> { ["payload"] = new UnserializableValue() },
            },
        });

        // Act
        var result = await Handler().Handle(command, CancellationToken.None);

        // Assert — mejor esfuerzo real: el mensaje se guarda, el contexto se pierde.
        result.Data.Should().BeTrue();
        saved.Should().ContainSingle();
        saved[0].Message.Should().Be("boom");
        saved[0].Context.Should().BeNull();
    }

    #endregion

    #region Tope después del filtrado

    [Fact]
    public async Task Handle_WithJunkBeforeGoodEntries_StillStoresFiftyUsableRows()
    {
        // Arrange — 5 nulos y 5 mensajes en blanco delante de 60 errores buenos.
        var entries = new List<ClientErrorEntryRequest>();
        entries.AddRange(Enumerable.Range(1, 5).Select(_ => (ClientErrorEntryRequest)null!));
        entries.AddRange(Enumerable.Range(1, 5).Select(_ => Entry("   ")));
        entries.AddRange(Enumerable.Range(1, 60).Select(i => Entry($"error {i}")));

        var saved = CaptureSaved();
        var command = new RecordClientErrorsCommand(_ownedStore.Id, entries);

        // Act
        await Handler().Handle(command, CancellationToken.None);

        // Assert
        saved.Should().HaveCount(50);
        saved[0].Message.Should().Be("error 1");
        saved[49].Message.Should().Be("error 50");
    }

    #endregion
}
