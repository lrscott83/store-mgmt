namespace Application.UnitOfWorks
{
    public interface IApplicationUnitOfWork
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken);
    }
}
