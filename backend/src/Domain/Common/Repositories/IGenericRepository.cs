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
        Task<IReadOnlyCollection<TEntity>> GetAllAsync();
        Task<bool> UpdateAsync(TEntity entity);
        IQueryable<TEntity> Where(Expression<Func<TEntity, bool>> predicate);
    }

    public interface IGenericRepository<TEntity, TId> 
        : IGenericRepository<TEntity> 
        where TEntity : Entity<TId>
    {
        Task<TEntity> GetByIdAsync(TId id);
        Task<bool> ExistsAsync(TId id);
    }
}