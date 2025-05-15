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
        public float Price { get; set; }
        public float CurrentPrice { get; set; }
        public float DiscountPrice { get; set; }
        public float PercentDiscountPrice { get; set; }
        public bool AvailableToStore { get; set; }
        public List<string> FeatureDescriptions { get; set; }
        public string DiscountText { get; set; }
    }
}
