using Application.ResponseModels;
using MediatR;

namespace Application.Abstractions.Messaging
{
    public interface IQuery<TResponse> : IRequest<ResponseResult<TResponse>>
    {
        
    }
}
