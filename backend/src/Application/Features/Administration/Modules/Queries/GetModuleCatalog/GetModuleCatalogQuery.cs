using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Modules;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Modules.Administration.Modules.Queries.GetModuleCatalog
{
    /// <summary>
    /// The SuperAdmin catalog editor's read (GET /v1/modules/catalog): every module available
    /// to stores, ACTIVE OR NOT, so the editor can both price and toggle activation.
    /// <para>
    /// Distinct from <c>GET /v1/modules/ToStore</c>, which stays the store-planning universe
    /// and keeps filtering <c>IsActive</c>: store plan editing must only ever show active
    /// modules. Listing inactive modules here is what makes the activation checkbox
    /// bidirectional — a module switched off is still listed and can be switched back on.
    /// </para>
    /// </summary>
    public sealed record GetModuleCatalogQuery : IQuery<IEnumerable<ModuleDto>>
    { }

    public class GetModuleCatalogQueryHandler : IQueryHandler<GetModuleCatalogQuery, IEnumerable<ModuleDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IModuleRepository _moduleRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetModuleCatalogQueryHandler(IHttpContextService httpContextService, IModuleRepository moduleRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _moduleRepository = moduleRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<ModuleDto>>> Handle(GetModuleCatalogQuery query, CancellationToken cancellationToken)
        {
            // SuperAdmin only, matching the write it feeds (PUT /v1/modules/pricing). The
            // action's [HasPermission(StoreRoleFeatures.SuperAdmin)] already refuses anyone
            // else; the check is repeated so the capability stays closed if the route is
            // ever re-exposed without its attribute.
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            IEnumerable<Module> modules = await _moduleRepository.GetAllModulesAvailableToStore();
            IEnumerable<ModuleDto> moduleDtos = _mapper.Map<IEnumerable<ModuleDto>>(modules).ToList();
            return ResponseResult.Success(moduleDtos);
        }
    }
}
