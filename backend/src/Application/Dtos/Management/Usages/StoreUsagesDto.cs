using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Dtos.Management.Usages
{
    public sealed record StoreUsagesDto(IList<int> StoreUsagesCountDays, int ActiveStoreCount)
    {
        // Owner display names of the stores used each day, aligned by index with
        // StoreUsagesCountDays (one item per day, empty list when no store was used).
        public IList<IList<string>> OwnerNamesPerDay { get; init; } = new List<IList<string>>();
    }
}
