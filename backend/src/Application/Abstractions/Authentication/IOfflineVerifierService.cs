namespace Application.Abstractions.Authentication
{
    public sealed record OfflineVerifierResult(string Hash, string Salt, int Iterations);

    public interface IOfflineVerifierService
    {
        OfflineVerifierResult CreateVerifier(string storedPasswordHash);
    }
}
