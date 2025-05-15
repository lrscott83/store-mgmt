namespace Domain.Common.Results
{
    public sealed record Error(string Code, string Description)
    {
        public static readonly Error None = new(string.Empty, string.Empty);
        public static readonly Error NullData = new("Error.NullData", "Null data was provided");
        public static readonly Error CreatingEntity = new("Error.CreatingEntity", "Error creating an entity");

        public static implicit operator Result(Error error) => Result.Failure(error);
    }
}
