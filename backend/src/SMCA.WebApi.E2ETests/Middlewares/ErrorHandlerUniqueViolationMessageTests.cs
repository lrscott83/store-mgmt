using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.Middlewares;
using Xunit;

namespace SMCA.WebApi.E2ETests.Middlewares;

/// <summary>
/// Pins the CLIENT-FACING contract of the unique-violation mapping: a concurrent duplicate insert
/// must answer 409 Conflict with a stable, non-leaking English message. The status/logging side of
/// the same mapping is already covered by <see cref="ErrorHandlerMiddlewareTests"/>; this file adds
/// the message assertion and the negative case for a PostgreSQL error that is NOT a unique
/// violation.
/// Hermetic: the real middleware, no database, no WebAppFactory.
/// </summary>
public sealed class ErrorHandlerUniqueViolationMessageTests
{
    private const string ConflictMessage =
        "The record already exists or was created by another request. Please retry.";

    [Fact]
    public async Task Unique_violation_maps_to_409_with_a_clear_english_message()
    {
        // Exactly how Npgsql surfaces a duplicate insert: the PostgresException is the inner
        // exception of the DbUpdateException EF Core throws from SaveChangesAsync.
        var thrown = new DbUpdateException("save failed",
            new PostgresException(
                "duplicate key value violates unique constraint \"IX_StoreCatalogSettings_StoreId\"",
                "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation));

        var (status, body) = await Run(thrown);

        status.Should().Be((int)HttpStatusCode.Conflict);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(409);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("App.Conflict");
        envelope.Errors[0].Description.Should().Be(ConflictMessage);

        // Nothing about the database may leak to the client.
        body.Should().NotContain("IX_StoreCatalogSettings_StoreId");
        body.Should().NotContain("duplicate key");
    }

    [Fact]
    public async Task Postgres_error_that_is_not_a_unique_violation_stays_500()
    {
        // Foreign-key violation (SQLSTATE 23503): a real save failure, but not a duplicate insert.
        var thrown = new DbUpdateException("save failed",
            new PostgresException(
                "insert or update on table violates foreign key constraint",
                "ERROR", "ERROR", PostgresErrorCodes.ForeignKeyViolation));

        var (status, body) = await Run(thrown);

        status.Should().Be((int)HttpStatusCode.InternalServerError);

        var envelope = Deserialize(body);
        envelope.ActionCode.Should().Be(500);
        envelope.Errors[0].Code.Should().Be("App.Unexpected");
    }

    private static async Task<(int Status, string Body)> Run(Exception thrown)
    {
        var middleware = new ErrorHandlerMiddleware(_ => throw thrown, NullLogger<ErrorHandlerMiddleware>.Instance);
        var context = new DefaultHttpContext { Response = { Body = new MemoryStream() } };

        await middleware.Invoke(context);

        context.Response.Body.Position = 0;
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();
        return (context.Response.StatusCode, body);
    }

    private static ApiResponse<object> Deserialize(string body) =>
        JsonSerializer.Deserialize<ApiResponse<object>>(body, ApiResponse.Json)
        ?? throw new InvalidOperationException($"Envelope deserialization returned null. Body: {body}");
}
