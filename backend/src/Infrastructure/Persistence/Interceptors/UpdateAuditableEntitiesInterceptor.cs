using Domain.Common.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Domain.Common.Extensions;
using Infrastructure.Interfaces.Services;
using Application.Abstractions.HttpContext;

namespace Infrastructure.Persistence.Interceptors
{
    public sealed class UpdateAuditableEntitiesInterceptor : SaveChangesInterceptor
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IDateTimeProvider _dateTimeProvider;

        public UpdateAuditableEntitiesInterceptor(IHttpContextService httpContextService, IDateTimeProvider dateTimeProvider)
        {
            _httpContextService = httpContextService;
            _dateTimeProvider = dateTimeProvider;
        }

        
        public async override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context is not null) 
            {
                SetAuditableColumns(eventData.Context);
            }

            return await base.SavingChangesAsync(eventData, result, cancellationToken);
        }

        private void SetAuditableColumns(DbContext context)
        {
            foreach (var entry in context.ChangeTracker.Entries<AuditableEntity>())
            {
                switch (entry.State)
                {
                    case EntityState.Added:
                        entry.Entity.CreatedDate = _dateTimeProvider.UtcNow;
                        entry.Entity.CreatedBy = _httpContextService.UserExternalId.ToGuid();
                        break;
                    case EntityState.Modified:
                        entry.Entity.UpdatedDate = _dateTimeProvider.UtcNow;
                        entry.Entity.UpdatedBy = _httpContextService.UserExternalId.ToGuid();
                        break;
                    case EntityState.Deleted:
                        entry.Entity.IsActive = false;
                        entry.Entity.UpdatedDate = _dateTimeProvider.UtcNow;
                        entry.Entity.UpdatedBy = _httpContextService.UserExternalId.ToGuid();
                        entry.State = EntityState.Modified;
                        break;
                }
            }
        }
    }
}
