using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Results;
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
            catch (Exception error)
            {
                _logger.LogError(error, "Unhandled exception: {Message}", error.Message);

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
    }
}
