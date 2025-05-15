using Application.ResponseModels;
using MediatR;

namespace Application.Abstractions.Messaging
{
    public interface IQueryHandler<in TQuery, TResponse> 
        : IRequestHandler<TQuery, ResponseResult<TResponse>> 
        where TQuery : IQuery<TResponse>
    {
        Task<ResponseResult<TResponse>> Handle(TQuery query, CancellationToken cancellationToken);
    }
}
