using Application.Abstractions.Time;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class MutableDateTimeProvider : IDateTimeProvider
{
    private DateTimeOffset? _pinned;

    public DateTimeOffset UtcNow => _pinned ?? DateTimeOffset.UtcNow;

    public IDisposable Pin(DateTimeOffset utcNow)
    {
        _pinned = utcNow;
        return new PinScope(this);
    }

    public void Reset() => _pinned = null;

    private sealed class PinScope : IDisposable
    {
        private readonly MutableDateTimeProvider _owner;

        public PinScope(MutableDateTimeProvider owner) => _owner = owner;

        public void Dispose() => _owner.Reset();
    }
}
