using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// El 400 de BINDING tiene que salir con el MISMO sobre que el resto de la API (advisory
/// R3-Unified400Untested de la revisión del Controller 3).
///
/// Antes había DOS formas de 400: un cuerpo que no se podía enlazar lo contestaba MVC con un
/// <c>ValidationProblemDetails</c> (<c>{ title, errors: { campo: [mensajes] } }</c>), mientras que una
/// regla de FluentValidation salía como <c>ResponseResult</c>
/// (<c>{ succeeded, errors: [{ code, description }] }</c>). El cliente lee <c>errors[0].description</c>
/// y en la primera forma recibía <c>undefined</c>. Este test fija que el binding se proyecta al mismo
/// sobre.
///
/// El dueño está AUTORIZADO a propósito: los filtros de autorización corren antes del binding, así que
/// con un llamador sin permiso saldría 403 y el binding nunca se evaluaría.
/// </summary>
[Collection("e2e")]
public sealed class ShowcaseValidationEnvelopeTests
{
    private readonly AppTestFactory _f;

    public ShowcaseValidationEnvelopeTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Reorder_with_a_body_that_cannot_be_bound_returns_the_unified_error_envelope()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            // `orderedIds` como string no se puede enlazar a la lista: es un fallo de BINDING, no una
            // regla de FluentValidation, así que antes salía con la forma de ProblemDetails.
            var response = await client.PutAsJsonAsync(
                "/api/v1/catalog/showcase/order",
                new { kind = 0, orderedIds = "no-es-una-lista" });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();
            body.Errors[0].Description.Should().NotBeNullOrWhiteSpace();
            body.ActionCode.Should().Be((int)HttpStatusCode.BadRequest);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
