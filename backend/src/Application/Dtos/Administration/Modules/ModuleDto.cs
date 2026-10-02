using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Dtos.Administration.Modules
{
    public sealed class ModuleDto
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public bool PriceIncluded { get; set; }

        /// <summary>
        /// Additive: the catalog/live flag the price rule needs — a module contributes to a
        /// total only when it is active and not price-included (<c>ModulePriceCalculator.IsBillable</c>).
        /// For the <c>StoreModule -&gt; ModuleDto</c> map this is the STORE's own
        /// <c>StoreModule.IsActive</c>.
        /// </summary>
        public bool IsActive { get; set; }
        public float Price { get; set; }
        public float CurrentPrice { get; set; }
        public float DiscountPrice { get; set; }
        public float PercentDiscountPrice { get; set; }
        public bool AvailableToStore { get; set; }
        public List<string> FeatureDescriptions { get; set; }
        public string DiscountText { get; set; }
    }
}
