using Domain.Common.Entities;
using Domain.Common.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;

namespace Infrastructure.Persistence.Repositories
{
    public abstract class GenericRepository<TEntity> : IGenericRepository<TEntity> where TEntity : Entity
    {
        protected readonly ApplicationDbContext _dbContext;

        public GenericRepository(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<IReadOnlyList<TEntity>> GetPagedReponseAsync(int pageNumber, int pageSize)
        {
            return await _dbContext
                .Set<TEntity>()
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .AsNoTracking()
                .ToListAsync();
        }

        public async Task<TEntity> AddAsync(TEntity entity)
        {
            await _dbContext.Set<TEntity>().AddAsync(entity);
            return entity;
        }

        public async Task AddRangeAsync(IEnumerable<TEntity> entities)
        {
            await _dbContext.Set<TEntity>().AddRangeAsync(entities);
        }

        public async Task<bool> UpdateAsync(TEntity entity)
        {
            _dbContext.Entry(entity).State = EntityState.Modified;
            return true;
        }

        public async Task<bool> DeleteAsync(TEntity entity)
        {
            _dbContext.Entry(entity).State = EntityState.Deleted;
            return true;
        }

        public async Task<IReadOnlyCollection<TEntity>> GetAllAsync()
        {
            return await _dbContext
                 .Set<TEntity>()
                 .ToListAsync();
        }

        public IQueryable<TEntity> Where(Expression<Func<TEntity, bool>> predicate)
        {
            return _dbContext
                .Set<TEntity>()
                .Where(predicate);
        }

        public async Task<bool> DeleteAsync(IEnumerable<TEntity> entities)
        {
            if (entities == null) return false;
            foreach (var entity in entities)
                _dbContext.Entry(entity).State = EntityState.Deleted;

            //await _dbContext.SaveChangesAsync();
            return true;
        }
    }

    public abstract class GenericRepository<TEntity, TId> : GenericRepository<TEntity> where TEntity : Entity<TId>
    {
        protected GenericRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
        }

        public virtual async Task<TEntity> GetByIdAsync(TId id)
        {
            return await _dbContext.Set<TEntity>().FindAsync(id);
        }

        public async Task<bool> ExistsAsync(TId id)
        {
            var entity = await GetByIdAsync(id);
            return entity != default;
        }
    }
}
