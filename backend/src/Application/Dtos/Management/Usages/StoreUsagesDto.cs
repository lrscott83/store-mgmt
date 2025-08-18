using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Dtos.Management.Usages
{
    public sealed record StoreUsagesDto(IList<int> StoreUsagesCountDays, int ActiveStoreCount)
    {
    }
}
