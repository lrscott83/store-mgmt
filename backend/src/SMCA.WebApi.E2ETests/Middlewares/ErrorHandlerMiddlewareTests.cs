using System.Net;
using System.Text.Json;
using Application.Exceptions;
using Domain.Common.Results;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.Middlewares;
using Xunit;

namespace SMCA.WebApi.E2ETests.Middlewares;

/// <summary>
/// Hermetic proof of the <see cref="ErrorHandlerMiddleware"/> logging contract (b5-error-log-severity).
/// Instantiates the REAL middleware directly with a throwing <see cref="RequestDelegate"/> and a
/// hand-rolled recording <see cref="ILogger{T}"/> — no WebAppFactory, no PostgreSQL, no Moq.
/// Deliberately NOT in [Collection("e2e")]: these tests need no database and must stay hermetic.
/// </summary>
public sealed class ErrorHandlerMiddlewareTests
{
    [Fact]
    public async Task ValidationException_logs_warning_without_exception_and_keeps_400_envelope()
    {
        var thrown = new ValidationException("Validation failed")
        {
            Errors = { new Error("Name", "Name is required") }
        };

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Warning);
        logs.Entries[0].Exception.Should().BeNull();
        logs.Entries[0].Message.Should().StartWith("Request rejected:");
        logs.Entries[0].Message.Should().Contain("Validation failed");

        status.Should().Be(400);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(400);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("Name");
        envelope.Errors[0].Description.Should().Be("Name is required");
    }

    [Fact]
    public async Task ApiException_400_logs_warning_without_exception_and_keeps_envelope()
    {
        var thrown = new ApiException("Invalid operation", HttpStatusCode.BadRequest)
        {
            AcctionCode = "App.InvalidOperation"
        };

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Warning);
        logs.Entries[0].Exception.Should().BeNull();
        logs.Entries[0].Message.Should().StartWith("Request rejected:");
        logs.Entries[0].Message.Should().Contain("Invalid operation");

        status.Should().Be(400);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(400);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("App.InvalidOperation");
        envelope.Errors[0].Description.Should().Be("Invalid operation");
    }

    [Fact]
    public async Task ApiException_404_logs_warning_without_exception_and_keeps_envelope()
    {
        var thrown = new ApiException("User not found", HttpStatusCode.NotFound);

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Warning);
        logs.Entries[0].Exception.Should().BeNull();
        logs.Entries[0].Message.Should().StartWith("Request rejected:");
        logs.Entries[0].Message.Should().Contain("User not found");

        status.Should().Be(404);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(404);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("App.Unexpected");
        envelope.Errors[0].Description.Should().Be("User not found");
    }

    [Fact]
    public async Task Unknown_exception_logs_error_with_exception_and_keeps_500_envelope()
    {
        var thrown = new InvalidOperationException("boom");

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Error);
        logs.Entries[0].Exception.Should().BeSameAs(thrown);
        logs.Entries[0].Message.Should().StartWith("Unhandled exception:");
        logs.Entries[0].Message.Should().Contain("boom");

        status.Should().Be(500);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(500);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("App.Unexpected");
    }

    [Fact]
    public async Task KeyNotFoundException_logs_error_with_exception_and_keeps_404_envelope()
    {
        var thrown = new KeyNotFoundException("missing");

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Error);
        logs.Entries[0].Exception.Should().BeSameAs(thrown);
        logs.Entries[0].Message.Should().StartWith("Unhandled exception:");
        logs.Entries[0].Message.Should().Contain("missing");

        status.Should().Be(404);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(404);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("App.Unexpected");
    }

    [Fact]
    public async Task Client_disconnect_logs_debug_with_exception_and_writes_no_response()
    {
        var thrown = new BadHttpRequestException("Unexpected end of request content");

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Debug);
        logs.Entries[0].Exception.Should().BeSameAs(thrown);
        logs.Entries[0].Message.Should().Contain("Client disconnected mid-request:");

        body.Length.Should().Be(0);
        status.Should().Be(200);
    }

    /// <summary>
    /// Una violación de índice único (choque de altas concurrentes) es un CONFLICTO del cliente, no un
    /// fallo del servidor: se mapea a 409 con un código estable y se registra como warning (no como
    /// error de servidor). Antes salía un 500 opaco.
    /// </summary>
    [Fact]
    public async Task Unique_violation_maps_to_409_conflict_and_logs_warning()
    {
        var thrown = new DbUpdateException("save failed",
            new PostgresException("duplicate key value violates unique constraint \"PK_StoreModule\"",
                "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation));

        var (status, body, logs) = await Run(thrown);

        logs.Entries.Should().HaveCount(1);
        logs.Entries[0].Level.Should().Be(LogLevel.Warning);
        logs.Entries[0].Exception.Should().BeNull();
        logs.Entries[0].Message.Should().StartWith("Request rejected:");

        status.Should().Be(409);

        var envelope = Deserialize(body);
        envelope.Succeeded.Should().BeFalse();
        envelope.ActionCode.Should().Be(409);
        envelope.Errors.Should().ContainSingle();
        envelope.Errors[0].Code.Should().Be("App.Conflict");
    }

    /// <summary>
    /// La excepción de PostgreSQL puede venir anidada a más de un nivel: el mapeo la encuentra igual.
    /// </summary>
    [Fact]
    public async Task Unique_violation_wrapped_deeper_still_maps_to_409()
    {
        var thrown = new DbUpdateException("save failed",
            new InvalidOperationException("wrapper",
                new PostgresException("duplicate key value", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation)));

        var (status, _, _) = await Run(thrown);

        status.Should().Be(409);
    }

    /// <summary>
    /// Control negativo: un fallo de guardado que NO es violación de unicidad sigue siendo 500.
    /// </summary>
    [Fact]
    public async Task DbUpdateException_without_a_unique_violation_stays_500()
    {
        var thrown = new DbUpdateException("save failed", new InvalidOperationException("boom"));

        var (status, _, _) = await Run(thrown);

        status.Should().Be(500);
    }

    /// <summary>
    /// La ampliación NO va más allá de un fallo de guardado: una violación de unicidad que NO venga
    /// envuelta en <see cref="DbUpdateException"/> sigue siendo un 500 (no se reclasifica a conflicto).
    /// </summary>
    [Fact]
    public async Task Unique_violation_outside_a_save_stays_500()
    {
        var thrown = new PostgresException("duplicate key value", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation);

        var (status, _, _) = await Run(thrown);

        status.Should().Be(500);
    }

    /// <summary>
    /// La excepción de PostgreSQL puede venir dentro de las internas MÚLTIPLES de un
    /// <see cref="AggregateException"/>: el recorrido las inspecciona y la encuentra.
    /// </summary>
    [Fact]
    public async Task Unique_violation_inside_a_nested_aggregate_still_maps_to_409()
    {
        var thrown = new DbUpdateException("save failed",
            new AggregateException(
                new PostgresException("duplicate key value", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation)));

        var (status, _, _) = await Run(thrown);

        status.Should().Be(409);
    }

    /// <summary>
    /// Runs the REAL <see cref="ErrorHandlerMiddleware"/> against an exception thrown by the
    /// next delegate, returning the resulting status, response body, and recorded log entries.
    /// </summary>
    private static async Task<(int Status, string Body, RecordingLogger<ErrorHandlerMiddleware> Logs)> Run(Exception thrown)
    {
        var logger = new RecordingLogger<ErrorHandlerMiddleware>();
        var middleware = new ErrorHandlerMiddleware(_ => throw thrown, logger);
        var context = new DefaultHttpContext { Response = { Body = new MemoryStream() } };

        await middleware.Invoke(context);

        context.Response.Body.Position = 0;
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();
        return (context.Response.StatusCode, body, logger);
    }

    private static ApiResponse<object> Deserialize(string body) =>
        JsonSerializer.Deserialize<ApiResponse<object>>(body, ApiResponse.Json)
        ?? throw new InvalidOperationException($"Envelope deserialization returned null. Body: {body}");

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        private readonly List<(LogLevel Level, Exception? Exception, string Message)> _entries = new();

        public IReadOnlyList<(LogLevel Level, Exception? Exception, string Message)> Entries
        {
            get { lock (_entries) { return _entries.ToList(); } }
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            lock (_entries)
            {
                _entries.Add((logLevel, exception, formatter(state, exception)));
            }
        }
    }
}
