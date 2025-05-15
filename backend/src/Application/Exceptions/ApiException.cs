using System.Globalization;
using System.Net;

namespace Application.Exceptions
{
    public class ApiException : Exception
    {
        public ApiException() : base() { }

        public ApiException(string message, HttpStatusCode code = HttpStatusCode.BadRequest) : base(message)
        => StatusCode = code;

        public ApiException(string message, params object[] args)
            : base(String.Format(CultureInfo.CurrentCulture, message, args))
        {
        }

        public HttpStatusCode StatusCode { get; set; } = HttpStatusCode.BadRequest;
        public string AcctionCode { get; set; }
    }
}
