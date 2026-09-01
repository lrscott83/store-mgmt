using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Dtos.Administration.Owners
{
    public sealed class OwnerStoreModuleDto
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; }
        public float StoreModuleTotalCurrentPrice { get; set; }
        public DateOnly? NextDueDate { get; set; }
    }
}
