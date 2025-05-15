namespace Domain.Common.Results
{
    public class Result
    {
        protected internal Result(bool succeeded, List<Error> errors)
        {
            Succeeded = succeeded;
            Errors = errors;
        }

        public bool Succeeded { get; init; }

        public List<Error> Errors { get; set; }

        public static Result Success() => new Result(true, []);
        public static Result Failure(List<Error> errors) => new Result(false, errors);
        public static Result Failure(Error error) => new Result(false, [error]);

        public static Result<TData> Success<TData>(TData data) => new(data, true, []);
        public static Result<TData> Failure<TData>(Error error) => new(default, false, [error]);
        public static Result<TData> Failure<TData>(List<Error> errors) => new(default, false, errors);
    }
    public class Result<TData> : Result
    {
        private readonly TData? _data;
        protected internal Result(TData? data, bool succeeded, List<Error> errors) : base(succeeded, errors)
        {
            _data = data;
        }

        public TData Data => Succeeded
            ? _data!
            : throw new InvalidOperationException("The data of the failure result can't be accessed.");

        public static implicit operator Result<TData>(TData? data)
            => data is not null ? Success(data) : Failure<TData>(Error.NullData);

    }
}
