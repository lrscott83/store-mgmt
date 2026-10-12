using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Results;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Text.Json;
using ValidationException = Application.Exceptions.ValidationException;

namespace SMCA.WebApi.Middlewares
{
    public class ErrorHandlerMiddleware
    {
        // Every other response is serialized by MVC, which applies
        // JsonSerializerDefaults.Web (camelCase). A bare JsonSerializer.Serialize
        // call applies no naming policy at all, so error bodies used to travel as
        // PascalCase ("Errors"/"Description") while success bodies were camelCase.
        // Clients read `errors[0].description` and silently got `undefined`, falling
        // back to a generic message that hid the server's own validation text.
        private static readonly JsonSerializerOptions SerializerOptions =
            new(JsonSerializerDefaults.Web);

        private readonly RequestDelegate _next;
        private ILogger<ErrorHandlerMiddleware> _logger;

        public ErrorHandlerMiddleware(
            RequestDelegate next,
            ILogger<ErrorHandlerMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task Invoke(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception error) when (IsClientDisconnect(context, error))
            {
                // The client hung up mid-request. This is NOT a server fault, and
                // there is nobody left to answer: falling through to the generic
                // branch below would (a) log a routine network event at Error
                // level, which in production reads as an outage, and (b) call
                // response.WriteAsync on a dead connection, which can throw a
                // SECOND exception that escapes this middleware entirely and gets
                // logged by Kestrel instead.
                //
                // Observed in the Playwright suite as
                // `BadHttpRequestException: Unexpected end of request content`,
                // logged as "Unhandled exception". The likeliest source is the
                // fire-and-forget usage POST (`store-usage-tracker.ts` posts to
                // /v1/usages/store-daily-usage with `void`, so nothing awaits it):
                // when the browser context closes, that request dies mid-body.
                // That client is behaving correctly — a background telemetry send
                // that loses a race with page teardown is normal, and the tracker
                // already resets its own state in a `finally`, so nothing is lost.
                _logger.LogDebug(error, "Client disconnected mid-request: {Message}", error.Message);
            }
            catch (Exception error)
            {
                if (error is ValidationException or ApiException || IsUniqueViolation(error))
                    _logger.LogWarning("Request rejected: {Message}", error.Message);
                else
                {
                    _logger.LogError(error,
                        "Unhandled exception: {ExceptionType}: {Message}\n{StackTrace}",
                        error.GetType().FullName,
                        error.Message,
                        error.StackTrace);
                    if (error.InnerException != null)
                        _logger.LogError(error.InnerException,
                            "Inner exception: {ExceptionType}: {Message}\n{StackTrace}",
                            error.InnerException.GetType().FullName,
                            error.InnerException.Message,
                            error.InnerException.StackTrace);
                }

                var response = context.Response;
                response.ContentType = "application/json";
                var responseModel = ResponseResult.Failure<string>(
                    new Error("App.Unexpected", "An unexpected error occurred. Please try again later."), 
                    (int)HttpStatusCode.InternalServerError);

                switch (error)
                {
                    case ValidationException e:
                        // custom application validation error
                        response.StatusCode = (int)e.StatusCode;
                        responseModel.ActionCode = (int)e.StatusCode;
                        responseModel.Errors = e.Errors;
                        break;
                    case ApiException e:
                        // custom application error
                        response.StatusCode = (int)e.StatusCode;
                        responseModel.ActionCode = (int)e.StatusCode;
                        responseModel.Errors = new List<Error> { new Error(e.AcctionCode ?? "App.Unexpected", e.Message) };
                        break;
                    case KeyNotFoundException e:
                        // not found error
                        response.StatusCode = (int)HttpStatusCode.NotFound;
                        responseModel.ActionCode = (int)HttpStatusCode.NotFound;
                        break;
                    case DbUpdateException when IsUniqueViolation(error):
                        // Dos altas concurrentes sobre el mismo índice único: es un CONFLICTO de
                        // cliente (reintentable), no un fallo del servidor. Sin esto salía un 500
                        // opaco — el caso que dejó abierto el alta de la configuración de pedidos.
                        response.StatusCode = (int)HttpStatusCode.Conflict;
                        responseModel.ActionCode = (int)HttpStatusCode.Conflict;
                        responseModel.Errors = new List<Error>
                        {
                            new Error("App.Conflict", "El recurso ya existe; vuelve a intentarlo."),
                        };
                        break;
                    default:
                        // unhandled error
                        response.StatusCode = (int)HttpStatusCode.InternalServerError;
                        responseModel.ActionCode = (int)HttpStatusCode.InternalServerError;
                        break;
                }
                var result = JsonSerializer.Serialize(responseModel, SerializerOptions);

                await response.WriteAsync(result);
            }
        }

        /// <summary>
        /// ¿El error es un fallo de guardado por violación de índice único de PostgreSQL (SQLSTATE
        /// 23505)? Dos cuidados:
        ///
        ///   * Se ancla en <see cref="DbUpdateException"/> —lo que EF lanza al guardar— para NO ampliar
        ///     el mapeo a una violación que llegue por otro camino: esa sigue siendo un 500.
        ///   * Recorre TODA la cadena de <c>InnerException</c> (incluidas las internas múltiples de un
        ///     <see cref="AggregateException"/>), porque la excepción de PostgreSQL puede venir anidada
        ///     a más de un nivel (envoltorios de batch/retry).
        ///
        /// Es un conflicto de cliente, no un fallo del servidor.
        /// </summary>
        private static bool IsUniqueViolation(Exception error)
        {
            if (error is not DbUpdateException)
                return false;

            return ContainsUniqueViolation(error);
        }

        private static bool ContainsUniqueViolation(Exception error)
        {
            if (error is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
                return true;

            if (error is AggregateException aggregate)
                return aggregate.InnerExceptions.Any(ContainsUniqueViolation);

            return error.InnerException is not null && ContainsUniqueViolation(error.InnerException);
        }

        /// <summary>
        /// Did the client go away, rather than the server fail?
        /// </summary>
        /// <remarks>
        /// Two signals, and both are needed. <see cref="HttpContext.RequestAborted"/>
        /// covers the general case of a client that vanished. A
        /// <see cref="BadHttpRequestException"/> covers the one Kestrel raises while
        /// reading a body that ended early ("Unexpected end of request content"):
        /// that body cannot be completed by anyone, so the request is over whether
        /// or not the abort token has been signalled yet.
        ///
        /// Deliberately NOT widened beyond that: a <see cref="BadHttpRequestException"/>
        /// on a live connection is a genuinely malformed request and today still
        /// falls through to the generic branch, which answers 500. That is arguably
        /// wrong — a malformed request deserves 400 — but changing a status code is a
        /// contract change with its own decision to make, so it is left alone here
        /// and recorded rather than quietly altered.
        /// </remarks>
        private static bool IsClientDisconnect(HttpContext context, Exception error)
        {
            if (context.RequestAborted.IsCancellationRequested)
            {
                return true;
            }

            return error is BadHttpRequestException
                && error.Message.Contains("Unexpected end of request content", StringComparison.Ordinal);
        }
    }
}
