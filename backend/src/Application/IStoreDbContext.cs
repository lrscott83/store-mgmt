namespace Application
{
    public interface IStoreDbContext
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken);
    }
}
