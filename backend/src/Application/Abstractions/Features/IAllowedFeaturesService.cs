using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Abstractions.Features
{
    public interface IAllowedFeaturesService
    {
        public Task<List<int>> GetAllowedFeatureIdsForCurrentUserAsync(List<int> storeModuleIds);
        public Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds);
    }
}
