using System.Linq.Expressions;
using Domain.Common.Entities;

namespace Domain.Common.Repositories
{
    public interface IGenericRepository<TEntity> where TEntity : Entity
    {
        Task<TEntity> AddAsync(TEntity entity);
        Task AddRangeAsync(IEnumerable<TEntity> entities);
        Task<bool> DeleteAsync(IEnumerable<TEntity> entities);
        Task<bool> DeleteAsync(TEntity entity);
        Task<bool> SoftDeleteAsync(TEntity entity);
        Task<bool> SoftDeleteAsync(IEnumerable<TEntity> entities);
        Task<bool> HardDeleteAsync(TEntity entity);
        Task<bool> HardDeleteAsync(IEnumerable<TEntity> entities);
        Task<IReadOnlyCollection<TEntity>> GetAllAsync();
        Task<bool> UpdateAsync(TEntity entity);
        IQueryable<TEntity> Where(Expression<Func<TEntity, bool>> predicate);
        Task<int> DeleteWhereAsync(Expression<Func<TEntity, bool>> predicate);
    }

    public interface IGenericRepository<TEntity, TId> 
        : IGenericRepository<TEntity> 
        where TEntity : Entity<TId>
    {
        Task<TEntity> GetByIdAsync(TId id);
        Task<bool> ExistsAsync(TId id);
    }
}