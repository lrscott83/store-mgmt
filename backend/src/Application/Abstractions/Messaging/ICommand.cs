using Application.ResponseModels;
using Domain.Common;
using MediatR;

namespace Application.Abstractions.Messaging
{
    public interface ICommand : IRequest<ResponseResult>
    {
    }

    public interface ICommand<TResponse> : IRequest<ResponseResult<TResponse>>
    {

    }
}
