using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Commands.MarkSalesCommissionPaid
{
    public sealed record MarkSalesCommissionPaidCommand(Guid Id, string? Note = null) : ICommand<bool>;

    /// <summary>
    /// T7: el Owner marca una comisión como pagada. El pago es COMPLETO y por comisión (S9).
    /// La comisión pertenece al Owner autenticado: si es de otro Owner responde 404, no 403, para
    /// no revelar que existe. El pagador es el `Owner.UserId`, nunca un id del cuerpo.
    /// </summary>
    public class MarkSalesCommissionPaidCommandHandler
        : ICommandHandler<MarkSalesCommissionPaidCommand, bool>
    {
        private const int MaxNoteLength = 500;

        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IOrderSalesCommissionRepository _commissionRepository;
        private readonly IDateTimeProvider _dateTimeProvider;

        public MarkSalesCommissionPaidCommandHandler(
            IApplicationUnitOfWork unitOfWork,
            IHttpContextService httpContextService,
            IOwnerRepository ownerRepository,
            IOrderSalesCommissionRepository commissionRepository,
            IDateTimeProvider dateTimeProvider)
        {
            _unitOfWork = unitOfWork;
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _commissionRepository = commissionRepository;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<ResponseResult<bool>> Handle(
            MarkSalesCommissionPaidCommand request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede pagar comisiones.", HttpStatusCode.Forbidden);

            Guid ownerUserId = _httpContextService.UserExternalId.ToGuid();
            Owner? owner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(ownerUserId);
            if (owner is null || !owner.IsActive)
                throw new ApiException("Owner no encontrado.", HttpStatusCode.Forbidden);

            OrderSalesCommission? commission = await _commissionRepository.GetByIdAsync(request.Id);
            if (commission is null || commission.OwnerId != owner.Id)
                throw new ApiException("Comisión no encontrada.", HttpStatusCode.NotFound);

            string? note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
            if (note is { Length: > MaxNoteLength })
                throw new ApiException(
                    $"La nota no puede superar {MaxNoteLength} caracteres.", HttpStatusCode.BadRequest);

            try
            {
                commission.MarkPaid(owner.UserId, _dateTimeProvider.UtcNow, note);
            }
            catch (SalesCommissionAlreadyPaidException exception)
            {
                // 409: la petición es válida, pero la comisión ya estaba pagada.
                throw new ApiException(exception.Message, HttpStatusCode.Conflict);
            }

            await _commissionRepository.UpdateAsync(commission);

            return ResponseResult.Success(
                await _unitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
