using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using Application.UnitOfWorks;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// R1-2 — un repartidor HEREDADO tiene que poder editarse.
///
/// El validador de la edición corre en CADA petición, incluidas las que solo cambian el nombre.
/// Mientras llevó las reglas estrictas del teléfono (solo caracteres marcables, al menos seis
/// dígitos), una fila guardada con letras, con `#` o `/`, o con menos de seis dígitos no se podía
/// guardar NI para corregir el nombre: el 400 saltaba por un campo que el cliente no había tocado.
///
/// El reparto que fijan estos tests:
///
///   * Teléfono SIN CAMBIOS: pasa, y la columna `Phone` NI SIQUIERA viaja en el UPDATE (la
///     escritura parcial solo toca el nombre).
///   * Teléfono CAMBIADO a otro valor inválido: el mismo 400, con el mismo mensaje estricto, desde
///     el handler (que es el único que ve la fila guardada).
///   * Teléfono CAMBIADO a uno válido: pasa y sí escribe `Phone`.
///   * El ALTA no cambia: sigue rechazando un teléfono inválido en el validador.
/// </summary>
public class DeliveryDriverLegacyPhoneUpdateTests
{
    /// <summary>
    /// Un valor que las reglas estrictas rechazan por TRES motivos a la vez: letras, `#`, y menos
    /// de seis dígitos. Es lo que puede haber quedado guardado antes de la regla.
    /// </summary>
    private const string LegacyPhone = "llamar a Ana #12";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IDeliveryDriverRepository> _driverRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public DeliveryDriverLegacyPhoneUpdateTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _driverRepository
            .Setup(x => x.UpdatePartialAsync(
                It.IsAny<DeliveryDriver>(),
                It.IsAny<DeliveryDriverChangedField>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
    }

    private UpdateDeliveryDriverCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _driverRepository.Object,
        _localizer.Object);

    /// <summary>Fila heredada: el teléfono guardado es el que las reglas estrictas rechazan.</summary>
    private DeliveryDriver LegacyExisting(string name = "Ana")
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, name, LegacyPhone, _tenantId);
        _driverRepository.Setup(x => x.GetByIdAsync(driver.Id)).ReturnsAsync(driver);
        return driver;
    }

    private static UpdateDeliveryDriverCommand Command(Guid id, string phone, string name = "Ana María")
        => new() { Id = id, Name = name, Phone = phone, IsActive = null };

    #region (a) teléfono heredado devuelto sin cambios

    /// <summary>
    /// El cliente lee el teléfono de la respuesta y lo devuelve tal cual: el PATCH tiene que
    /// guardar SOLO el nombre. Ni siquiera la columna `Phone` viaja en el UPDATE, así que dos PATCH
    /// concurrentes no se pisan.
    /// </summary>
    [Fact]
    public async Task Handle_WhenALegacyPhoneComesBackUnchanged_ShouldSucceedAndWriteOnlyTheName()
    {
        DeliveryDriver driver = LegacyExisting();

        var result = await Handler().Handle(Command(driver.Id, LegacyPhone), CancellationToken.None);

        result.Succeeded.Should().BeTrue("un valor heredado sin tocar no puede bloquear la edición");
        result.Data!.Name.Should().Be("Ana María");
        result.Data.Phone.Should().Be(LegacyPhone, "el teléfono heredado se conserva intacto");

        _driverRepository.Verify(x => x.UpdatePartialAsync(
            It.Is<DeliveryDriver>(d => d.Id == driver.Id && d.Phone == LegacyPhone),
            DeliveryDriverChangedField.Name,
            It.IsAny<CancellationToken>()),
            Times.Once,
            "solo el nombre cambió: `Phone` no debe formar parte del UPDATE");
    }

    /// <summary>
    /// El espacio alrededor no es un cambio: el valor guardado se compara recortado contra el
    /// entrante recortado.
    /// </summary>
    [Fact]
    public async Task Handle_WhenALegacyPhoneComesBackWithSurroundingSpaces_ShouldWriteOnlyTheName()
    {
        DeliveryDriver driver = LegacyExisting();

        var result = await Handler().Handle(
            Command(driver.Id, $"  {LegacyPhone}  "), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Phone.Should().Be(LegacyPhone);

        _driverRepository.Verify(x => x.UpdatePartialAsync(
            It.IsAny<DeliveryDriver>(),
            DeliveryDriverChangedField.Name,
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    #endregion

    #region (b) teléfono heredado cambiado a OTRO valor inválido

    /// <summary>
    /// Cambiar el teléfono es una decisión: ahí siguen mandando las reglas estrictas. El 400 es el
    /// MISMO que lanzaba el validador —incluido el nombre de propiedad, que el cliente lee como
    /// `errors[].code`— y no se escribe nada.
    /// </summary>
    [Theory]
    [InlineData("+53 5 123 4567 #12", "only contain")]
    [InlineData("12345", "at least 6 digits")]
    public async Task Handle_WhenThePhoneChangesToAnotherInvalidValue_ShouldRejectWithTheStrictMessage(
        string phone, string expectedFragment)
    {
        DeliveryDriver driver = LegacyExisting();

        Func<Task> act = () => Handler().Handle(Command(driver.Id, phone), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ValidationException>(
            "el cliente tiene que recibir el mismo 400 que antes");
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Errors.Should().ContainSingle(error =>
            error.Code == "Phone" && error.Description.Contains(expectedFragment));

        _driverRepository.Verify(x => x.UpdatePartialAsync(
            It.IsAny<DeliveryDriver>(),
            It.IsAny<DeliveryDriverChangedField>(),
            It.IsAny<CancellationToken>()),
            Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region (c) teléfono heredado cambiado a uno VÁLIDO

    /// <summary>Corregir el teléfono sí lo escribe: la regla estricta lo deja pasar.</summary>
    [Fact]
    public async Task Handle_WhenThePhoneChangesToAValidValue_ShouldSucceedAndWriteThePhone()
    {
        DeliveryDriver driver = LegacyExisting();

        var result = await Handler().Handle(
            Command(driver.Id, "+5352222333"), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Phone.Should().Be("+5352222333");

        _driverRepository.Verify(x => x.UpdatePartialAsync(
            It.Is<DeliveryDriver>(d => d.Id == driver.Id && d.Phone == "+5352222333"),
            It.Is<DeliveryDriverChangedField>(fields =>
                fields.HasFlag(DeliveryDriverChangedField.Name)
                && fields.HasFlag(DeliveryDriverChangedField.Phone)),
            It.IsAny<CancellationToken>()),
            Times.Once);
    }

    #endregion

    #region (d) el ALTA no cambia

    private CreateDeliveryDriverCommandValidator CreateValidator() => new(_localizer.Object);

    [Theory]
    [InlineData("llamar a Ana")]
    [InlineData("+53 5 123 4567 #12")]
    [InlineData("12345")]
    public void Create_WithAnInvalidPhone_ShouldStillFail(string phone)
    {
        var result = CreateValidator().Validate(
            new CreateDeliveryDriverCommand { Name = "Ana", Phone = phone });

        result.IsValid.Should().BeFalse("el alta conserva las reglas estrictas");
    }

    #endregion
}
