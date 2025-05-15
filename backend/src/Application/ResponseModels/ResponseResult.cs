using Domain.Common.Results;

namespace Application.ResponseModels
{
    public class ResponseResult : Result
    {
        protected internal ResponseResult(bool succeeded, List<Error> errors) : base(succeeded, errors)
        {
        }

        public static ResponseResult<TData> Success<TData>(TData data) => new(data, true, []);
        public static ResponseResult<TData> SuccessWithMessage<TData>(TData data, string message) => new(data, true, [], message);

        public static ResponseResult<TData> Failure<TData>(Error error, int actionCode)
            => new(default, false, [error], actionCode: actionCode);
        public static ResponseResult<TData> Failure<TData>(List<Error> errors, int actionCode)
            => new(default, false, errors, actionCode: actionCode);
    }

    public class ResponseResult<TData> : ResponseResult
    {
        private readonly TData? _data;
        protected internal ResponseResult(TData? data, bool succeeded, List<Error> errors,
            string? message = null, int? actionCode = null)
            : base(succeeded, errors)
        {
            _data = data;
            Message = message;
            ActionCode = actionCode;
        }

        public TData Data => _data;

        public string? Message { get; }
        public int? ActionCode { get; set; }

        public static implicit operator ResponseResult<TData>(TData? data)
            => data is not null ? Success(data) : Failure<TData>(Error.NullData, 500);
    }
}
