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

namespace Application.Modules.Administration.Modules.Queries.GetAvailableModulesToStore
{
    public sealed record GetAvailableModulesToStoreQuery : IQuery<IEnumerable<ModuleDto>>
    { }

    public class GetAvailableModulesToStoreQueryHandler : IQueryHandler<GetAvailableModulesToStoreQuery, IEnumerable<ModuleDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IModuleRepository _moduleRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetAvailableModulesToStoreQueryHandler(IHttpContextService httpContextService, IModuleRepository moduleRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _moduleRepository = moduleRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<ModuleDto>>> Handle(GetAvailableModulesToStoreQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<Module> modules = await _moduleRepository.GetAvailableModulesToStore();
            IEnumerable<ModuleDto> moduleDtos = _mapper.Map<IEnumerable<ModuleDto>>(modules).ToList();
            return ResponseResult.Success(moduleDtos);
        }
    }
}
