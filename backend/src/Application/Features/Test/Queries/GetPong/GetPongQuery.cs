using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common;

namespace Application.Features.Test.Queries.GetPong
{
    public sealed record GetPongQuery : IQuery<string> { }

    public class GetPongQueryHandler : IQueryHandler<GetPongQuery, string>
    {
        public async Task<ResponseResult<string>> Handle(GetPongQuery query, CancellationToken cancellationToken)
        {
            return ResponseResult.Success("pong");
        }
    }
}
