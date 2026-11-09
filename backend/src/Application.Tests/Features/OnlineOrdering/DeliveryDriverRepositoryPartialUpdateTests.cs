using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// S9 — el PATCH de un repartidor persiste SOLO las columnas que cambian.
///
/// El modo de fallo que esto cierra es silencioso: con <c>Entry.State = Modified</c> la fila entera
/// viaja en el UPDATE, así que dos PATCH concurrentes —uno corrigiendo el nombre y otro apagando el
/// interruptor— se pisan mutuamente y el último escribe los valores que leyó antes. Marcar solo las
/// columnas cambiadas hace que Postgres escriba las suyas y nadie más.
///
/// Y lo que NO se puede marcar nunca: `TenantId`, `StoreId` y las columnas de auditoría. Un cuerpo
/// no elige la tienda ni el tenant de la fila (criterio 2), y la auditoría la pone el interceptor,
/// no el repositorio.
///
/// Se prueba aquí, con un contexto en memoria, porque es comportamiento del <c>ChangeTracker</c>:
/// no hace falta PostgreSQL para saber qué columnas quedaron marcadas.
/// </summary>
public class DeliveryDriverRepositoryPartialUpdateTests
{
    private static (ApplicationDbContext Context, DeliveryDriverRepository Repository, DeliveryDriver Driver)
        CreateContextWithDriver()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(true);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        var context = new ApplicationDbContext(
            options, new TenantIdProvider(new HttpContextAccessor()), httpContextMock.Object);

        // `ApplicationDbContext` es `NoTracking`: la entidad creada queda `Detached`, que es la
        // forma exacta en la que el handler entrega la fila al repositorio.
        var driver = DeliveryDriver.Create(Guid.NewGuid(), "Ana", "+5351111111", Guid.NewGuid());

        return (context, new DeliveryDriverRepository(context), driver);
    }

    /// <summary>
    /// `Name` y `Phone` son el PATCH que siempre escribe: los dos van marcados y nada más.
    /// </summary>
    [Fact]
    public async Task UpdatePartialAsync_WithNameAndPhone_ShouldMarkOnlyThoseColumns()
    {
        var (context, repository, driver) = CreateContextWithDriver();

        await repository.UpdatePartialAsync(
            driver, DeliveryDriverChangedField.Name | DeliveryDriverChangedField.Phone);

        var entry = context.Entry(driver);
        entry.State.Should().Be(EntityState.Modified);
        entry.Property(nameof(DeliveryDriver.Name)).IsModified.Should().BeTrue();
        entry.Property(nameof(DeliveryDriver.Phone)).IsModified.Should().BeTrue();

        entry.Property(nameof(DeliveryDriver.IsActive)).IsModified.Should().BeFalse(
            "el cuerpo no mencionó el interruptor, así que no se escribe");
    }

    /// <summary>
    /// El aislamiento no es negociable: ni la tienda ni el tenant de la fila pueden viajar en un
    /// UPDATE que salió de un cuerpo del cliente.
    /// </summary>
    [Fact]
    public async Task UpdatePartialAsync_ShouldNeverMarkTheStoreOrTheTenant()
    {
        var (context, repository, driver) = CreateContextWithDriver();

        await repository.UpdatePartialAsync(
            driver,
            DeliveryDriverChangedField.Name | DeliveryDriverChangedField.Phone | DeliveryDriverChangedField.IsActive);

        var entry = context.Entry(driver);
        entry.Property(nameof(DeliveryDriver.StoreId)).IsModified.Should().BeFalse(
            "la tienda es la del contexto y el cuerpo no la puede mover");
        entry.Property(nameof(DeliveryDriver.TenantId)).IsModified.Should().BeFalse(
            "el tenant es de la fila, no de la petición");
        entry.Property(nameof(DeliveryDriver.Id)).IsModified.Should().BeFalse(
            "la clave no se reescribe");
        entry.Property(nameof(DeliveryDriver.CreatedDate)).IsModified.Should().BeFalse();
        entry.Property(nameof(DeliveryDriver.CreatedBy)).IsModified.Should().BeFalse();
        entry.Property(nameof(DeliveryDriver.UpdatedDate)).IsModified.Should().BeFalse(
            "la auditoría la pone el interceptor, no este repositorio");
        entry.Property(nameof(DeliveryDriver.UpdatedBy)).IsModified.Should().BeFalse();
    }

    /// <summary>El interruptor explícito también se escribe, y sigue siendo el único campo de estado.</summary>
    [Fact]
    public async Task UpdatePartialAsync_WithIsActive_ShouldMarkTheFlag()
    {
        var (context, repository, driver) = CreateContextWithDriver();
        driver.IsActive = false;

        await repository.UpdatePartialAsync(
            driver, DeliveryDriverChangedField.Name | DeliveryDriverChangedField.IsActive);

        var entry = context.Entry(driver);
        entry.Property(nameof(DeliveryDriver.IsActive)).IsModified.Should().BeTrue(
            "el cuerpo pidió la baja explícitamente");
        entry.Property(nameof(DeliveryDriver.Phone)).IsModified.Should().BeFalse();
    }

    /// <summary>
    /// Un conjunto vacío devolvería `true` sin escribir nada: un 200 que miente. Falla en voz alta.
    /// </summary>
    [Fact]
    public async Task UpdatePartialAsync_WithNoChangedFields_ShouldThrow()
    {
        var (_, repository, driver) = CreateContextWithDriver();

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(driver, DeliveryDriverChangedField.None))
            .Should().ThrowAsync<ArgumentException>(
                "un conjunto vacío reportaría éxito sin escribir ninguna columna");
    }

    /// <summary>
    /// Añadir un miembro al enum sin mapearlo a una propiedad de EF tiene que romper aquí, no
    /// escribir en silencio una columna que nadie mapeó.
    /// </summary>
    [Fact]
    public async Task UpdatePartialAsync_WithAnUnmappedField_ShouldThrow()
    {
        var (_, repository, driver) = CreateContextWithDriver();

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(driver, (DeliveryDriverChangedField)8))
            .Should().ThrowAsync<ArgumentOutOfRangeException>(
                "un campo nuevo del dominio se mapea a una columna o falla en voz alta");
    }

    /// <summary>
    /// Una entidad YA rastreada no se puede resetear a `Unchanged`: sus cambios pendientes se
    /// perderían y el `SaveChanges` posterior escribiría otro estado.
    /// </summary>
    [Fact]
    public async Task UpdatePartialAsync_WithAnAlreadyTrackedEntity_ShouldThrow()
    {
        var (context, repository, driver) = CreateContextWithDriver();
        context.Attach(driver);

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(driver, DeliveryDriverChangedField.Name))
            .Should().ThrowAsync<InvalidOperationException>(
                "resetear una entidad rastreada descartaría sus cambios pendientes");
    }

    [Fact]
    public async Task UpdatePartialAsync_WithACancelledToken_ShouldThrow()
    {
        var (_, repository, driver) = CreateContextWithDriver();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await FluentActions
            .Awaiting(() => repository.UpdatePartialAsync(driver, DeliveryDriverChangedField.Name, cts.Token))
            .Should().ThrowAsync<OperationCanceledException>();
    }
}
