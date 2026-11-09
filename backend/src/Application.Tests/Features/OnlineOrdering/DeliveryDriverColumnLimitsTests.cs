using Application.Abstractions.HttpContext;
using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Services.Tenants;
using Domain.Entities.DeliveryDrivers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El validador del alta mide contra las constantes del COMANDO; la columna mide lo que diga el
/// modelo. Si los dos números se separan, un nombre que el validador acepta revienta en el INSERT
/// (500) y el caso de frontera del E2E deja de probar la frontera real.
///
/// Vive aquí y NO en el E2E porque es una comparación estática del modelo: no necesita base de
/// datos, ni HTTP, ni el fixture completo. El E2E conserva la prueba del comportamiento observable
/// (el alta con el valor exacto responde 200 y persiste).
/// </summary>
public class DeliveryDriverColumnLimitsTests
{
    [Fact]
    public void Command_length_limits_must_match_the_ef_column_lengths()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContext = new Mock<IHttpContextService>();
        httpContext.Setup(x => x.IsSuperAdmin).Returns(true);
        httpContext.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContext.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        using var context = new ApplicationDbContext(
            options, new TenantIdProvider(new HttpContextAccessor()), httpContext.Object);

        var metadata = context.Model.FindEntityType(typeof(DeliveryDriver));

        metadata.Should().NotBeNull("el modelo tiene que conocer la entidad");

        metadata!.FindProperty(nameof(DeliveryDriver.Name))!.GetMaxLength()
            .Should().Be(CreateDeliveryDriverCommand.NameMaxLength,
                "el validador y la columna `Name` tienen que medir lo mismo");
        metadata.FindProperty(nameof(DeliveryDriver.Phone))!.GetMaxLength()
            .Should().Be(CreateDeliveryDriverCommand.PhoneMaxLength,
                "el validador y la columna `Phone` tienen que medir lo mismo");
    }
}
