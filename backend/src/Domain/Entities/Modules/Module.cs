using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Features;
using Domain.Entities.StoreModules;

namespace Domain.Entities.Modules
{
    public sealed class Module : Entity<int>
    {
        public string Name { get; set; }
        public ICollection<Feature> Features { get; set; }
        public ICollection<StoreModule> StoreModules { get; set; }
        public bool IsActive { get; set; } = false;
        public int Order { get; set; }
        public bool PriceIncluded { get; set; }
        public float Price { get; set; }
        public float DiscountPrice { get; set; } = 0;
        public float PercentDiscountPrice { get; set; } = 0;
        public bool AvailableToStore { get; set; } = false;

        private Module(int id, string name, int order, bool priceIncluded, float price, float discountPrice, float percentDiscountPrice, 
            bool availableToStore, bool isActive) : base(id)
        {
            Name = name;
            Order = order;
            IsActive = isActive;
            PriceIncluded = priceIncluded;
            Price = price;
            DiscountPrice = discountPrice;
            AvailableToStore = availableToStore;
            PercentDiscountPrice = percentDiscountPrice;
            Features = new List<Feature>();
        }

        public static Module Create(int id, string name, int order, bool priceIncluded, float price, float discountPrice, float percentDiscountPrice, 
            bool availableToStore, bool isActive)
        {
            var module = new Module(id, name, order, priceIncluded, price, discountPrice, percentDiscountPrice, availableToStore, isActive);
            module.Raise(new ModuleCreatedDomainEvent(id));
            return module;
        }

        public static Module Create(int id, string name, int order, bool priceIncluded, float price, bool availableToStore, bool isActive)
        {
            var module = new Module(id, name, order, priceIncluded, price, 0, 0, availableToStore, isActive);
            module.Raise(new ModuleCreatedDomainEvent(id));
            return module;
        }
    }

    public sealed record ModuleCreatedDomainEvent(int ModuleId) : IDomainEvent { }
}
