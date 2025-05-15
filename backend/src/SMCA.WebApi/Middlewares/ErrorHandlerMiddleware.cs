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
                _logger.LogError(new EventId(error.HResult), error,error.Message);

                var response = context.Response;
                response.ContentType = "application/json";
                var responseModel = ResponseResult.Failure<string>(
                    new Error("App.Unexpected", error?.Message ?? ""), 
                    (int)HttpStatusCode.InternalServerError) ;

                switch (error)
                {
                    case ValidationException e:
                        // custom application validation error
                        response.StatusCode = (int)e.StatusCode;
                        responseModel.ActionCode = (int)e.StatusCode;
                        //responseModel.Errors = ResponseResult.Failure<string>(e.Errors, (int)e.StatusCode);
                        responseModel.Errors = e.Errors;
                        break;
                    case ApiException e:
                        // custom application error
                        response.StatusCode = (int)e.StatusCode;
                        responseModel.ActionCode = (int)e.StatusCode;
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
                var result = JsonSerializer.Serialize(responseModel);

                await response.WriteAsync(result);
            }
        }
    }
}
