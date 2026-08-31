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

            return true;
        }

        /// <summary>
        /// Soft delete: sets IsActive = false instead of removing the row.
        /// This preserves the record in the database for audit/history purposes.
        /// Does NOT trigger the SaveChanges interceptor — caller must call SaveChangesAsync.
        /// </summary>
        public async Task<bool> SoftDeleteAsync(TEntity entity)
        {
            if (entity == null) return false;
            if (entity is AuditableEntity auditable)
            {
                auditable.IsActive = false;
                auditable.UpdatedDate = DateTimeOffset.UtcNow;
            }
            _dbContext.Entry(entity).State = EntityState.Modified;
            return true;
        }

        public async Task<bool> SoftDeleteAsync(IEnumerable<TEntity> entities)
        {
            if (entities == null) return false;
            foreach (var entity in entities)
            {
                if (entity is AuditableEntity auditable)
                {
                    auditable.IsActive = false;
                    auditable.UpdatedDate = DateTimeOffset.UtcNow;
                }
                _dbContext.Entry(entity).State = EntityState.Modified;
            }
            return true;
        }

        /// <summary>
        /// Hard delete: physically removes the entity from the database.
        /// Unlike DeleteAsync (soft delete), this bypasses the auditable interceptor
        /// and issues a DELETE SQL statement that cannot be undone.
        /// Uses IgnoreQueryFilters to ensure the entity is found even if soft-deleted.
        /// </summary>
        public async Task<bool> HardDeleteAsync(TEntity entity)
        {
            if (entity == null) return false;
            // Use the entity's Id to delete directly via SQL, bypassing change tracker
            // and FK cascade logic that would fail with Remove/RemoveRange.
            var idProperty = _dbContext.Model.FindEntityType(typeof(TEntity))?.FindPrimaryKey()?.Properties.FirstOrDefault();
            if (idProperty == null) return false;

            var idValue = idProperty.PropertyInfo?.GetValue(entity);
            if (idValue == null) return false;

            var param = System.Linq.Expressions.Expression.Parameter(typeof(TEntity), "e");
            var property = System.Linq.Expressions.Expression.Property(param, idProperty.Name);
            var constant = System.Linq.Expressions.Expression.Constant(idValue, idValue.GetType());
            var predicate = System.Linq.Expressions.Expression.Lambda<Func<TEntity, bool>>(
                System.Linq.Expressions.Expression.Equal(property, constant), param);

            await _dbContext.Set<TEntity>().IgnoreQueryFilters().Where(predicate).ExecuteDeleteAsync();
            // Detach from change tracker to prevent SaveChangesAsync from
            // trying to process an entity already deleted by ExecuteDeleteAsync.
            _dbContext.Entry(entity).State = EntityState.Detached;
            return true;
        }

        public async Task<bool> HardDeleteAsync(IEnumerable<TEntity> entities)
        {
            if (entities == null || !entities.Any()) return false;
            foreach (var entity in entities)
            {
                await HardDeleteAsync(entity);
            }
            return true;
        }

        public async Task<int> HardDeleteWhereAsync(Expression<Func<TEntity, bool>> predicate)
        {
            return await _dbContext.Set<TEntity>().IgnoreQueryFilters().Where(predicate).ExecuteDeleteAsync();
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
