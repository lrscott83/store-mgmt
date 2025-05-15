using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Interfaces.Services.Tenants;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.ApplicationManagement.Tenants.Commands.CreateTenant
{
    public sealed record CreateTenantCommand(
        string Name, string Description, string? ConnectionString, IEnumerable<int> FeatureIds)
        : ICommand<bool>
    { }

    public class CreateTenantCommandHandler : ICommandHandler<CreateTenantCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IMapper _mapper;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ICreateTenantService _createTenantService;

        public CreateTenantCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IMapper mapper,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            ICreateTenantService createTenantService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _mapper = mapper;
            _localizer = localizer;
            _createTenantService = createTenantService;
        }

        public async Task<ResponseResult<bool>> Handle(CreateTenantCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            CreateTenantRequestModel createTenantRequestModel = _mapper.Map<CreateTenantRequestModel>(request);
            await _createTenantService.CreateTenantAsync(createTenantRequestModel);

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
