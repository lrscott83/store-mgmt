using Application.ResponseModels;
using MediatR;

namespace Application.Abstractions.Messaging
{
    public interface ICommandHandler<in TCommand> 
        : IRequestHandler<TCommand, ResponseResult> 
        where TCommand : ICommand
    {
        Task<ResponseResult> Handle(TCommand command, CancellationToken cancellationToken);
    }

    public interface ICommandHandler<in TCommand, TResponse> 
        : IRequestHandler<TCommand, ResponseResult<TResponse>> 
        where TCommand : ICommand<TResponse>
    {
        Task<ResponseResult<TResponse>> Handle(TCommand command, CancellationToken cancellationToken);
    }
}
