using FastEndpoints;
using MediatR;

namespace WebApi.Endpoints.Stores
{
    public class GetStoreOwner(IMediator _mediator) : Endpoint<GetStoreOwnerRequest, GetStoreOwnerResponse>
    {
        public override void Configure()
        {
            Get("api/store/{id}/owner");
            AllowAnonymous();
        }

        public override async Task HandleAsync(GetStoreOwnerRequest req, CancellationToken ct)
        {
            var result = await _mediator.Send(new GetStoreOwnerQuery(req.StoreId));

            if (result is null)
                await SendNotFoundAsync();
            else
                await SendOkAsync(result);
        }
    }

    public record GetStoreOwnerQuery(Guid StoreId) : IRequest<GetStoreOwnerResponse>;

    public class GetStoreOwnerRequest 
    {
        [BindFrom("id")]
        public Guid StoreId { get; init; }
    }

    public record GetStoreOwnerResponse(Guid OwnerId, string OwnerName);

    public class GetStoreOwnerQueryHandler : IRequestHandler<GetStoreOwnerQuery, GetStoreOwnerResponse>
    {
        public async Task<GetStoreOwnerResponse> Handle(GetStoreOwnerQuery request, CancellationToken cancellationToken)
        {
            return new GetStoreOwnerResponse(request.StoreId, "OwnerName");
        }
    }
}
