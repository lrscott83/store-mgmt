using Domain.Common.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Domain.Common.Extensions
{
    public static class DBContextExtensions
    {
        /// <summary>
        /// This is called in the SaveChanges of db contexts  
        /// Its job is to call the SetTenantId on entities that have it 
        /// and are being created by non Global Admin users
        /// </summary>
        /// <param name="context"></param>
        /// <param name="tenantId"></param>
        /// <param name="isGlobalAdmin"></param>
        public static void SetTenantIdOnCreation(this DbContext context, Guid? tenantId, bool isGlobalAdmin)
        {
            //At startup tenantId will empty, so ignore the setting of the TenantId
            //This allows my seeding code to work. 
            //When user saving is a Global Admin, ignore the setting of the TenantId
            //This allows GlobalAdmin setting informations for other Tenants
            if (!tenantId.HasValue || tenantId.Value == Guid.Empty || isGlobalAdmin) return;

            foreach (var entityEntry in context.ChangeTracker.Entries()
                .Where(e => e.State == EntityState.Added))
            {
                if (entityEntry.Entity is ITenantBaseEntity entityToMark)
                {
                    //entityToMark.SetTenantId(tenantId.Value);
                }
            }
        }

        /// <summary>
        /// This is called in the SaveChanges of db contexts  
        /// Its job is to set values on CreatedDate, CreatedBy, UpdatedDate, UpdatedBy and IsActive columns 
        /// on entities that have them and are being created, updated or deleted
        /// </summary>
        /// <param name="context"></param>
        /// <param name="userId"></param>
        public static void SetAuditableColumns(this DbContext context, Guid userId)
        {
            foreach (var entry in context.ChangeTracker.Entries<IAuditableEntity>())
            {
                switch (entry.State)
                {
                    case EntityState.Added:
                        entry.Entity.CreatedDate = DateTime.UtcNow;
                        entry.Entity.CreatedBy = userId;
                        break;
                    case EntityState.Modified:
                        entry.Entity.UpdatedDate = DateTime.UtcNow;
                        entry.Entity.UpdatedBy = userId;
                        break;
                    case EntityState.Deleted:
                        entry.Entity.IsActive = false;
                        entry.Entity.UpdatedDate = DateTime.UtcNow;
                        entry.Entity.UpdatedBy = userId;
                        entry.State = EntityState.Modified;
                        break;
                }
            }
        }
    }
}
