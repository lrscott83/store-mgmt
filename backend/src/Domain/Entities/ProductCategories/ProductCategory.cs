using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Products;
using Domain.Entities.Stores;

namespace Domain.Entities.ProductCategories
{
    public sealed class ProductCategory : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public string Name { get; set; }
        public int Order { get; set; }
        public Guid TenantId { get; set; }
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public ICollection<Product> Products { get; set; }

        private ProductCategory(Guid id, Guid storeId, string name, int order, Guid tenantId)
            : base(id)
        {
            StoreId = storeId;
            Name = name;
            Order = order;
            TenantId = tenantId;
            Products = new List<Product>();
        }

        private static ProductCategory Create(Guid id, Guid storeId, string name, int order, Guid tenantId)
        {
            var category = new ProductCategory(id, storeId, name, order, tenantId);
            category.Raise(new ProductCategoryCreatedDomainEvent(category.Id, storeId));
            return category;
        }

        public static ProductCategory Create(Guid storeId, string name, int order, Guid tenantId)
        {
            return Create(Guid.NewGuid(), storeId, name, order, tenantId);
        }
    }

    public sealed record ProductCategoryCreatedDomainEvent(Guid ProductCategoryId, Guid StoreId) : IDomainEvent;
}
