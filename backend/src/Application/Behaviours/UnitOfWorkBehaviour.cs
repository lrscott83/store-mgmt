using Application.UnitOfWorks;
using MediatR;
using System.Transactions;

namespace Application.Behaviours
{
    public sealed class UnitOfWorkBehaviour<TRequest, TResponse>
        : IPipelineBehavior<TRequest, TResponse>
        where TRequest : notnull
    {

        private readonly IApplicationUnitOfWork _storeUnitOfWork;
        public UnitOfWorkBehaviour(IApplicationUnitOfWork storeUnitOfWork)
        {
            _storeUnitOfWork = storeUnitOfWork;
        }

        public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
        {
            if (IsQuery())
                return await next();

            using (var transactionScope = new TransactionScope())
            {
                var response = await next();

                await _storeUnitOfWork.SaveChangesAsync(cancellationToken);

                transactionScope.Complete();

                return response;
            }

        }

        private static bool IsQuery()
        {
            //return !typeof(TRequest).Name.EndsWith("Command");
            return true;
        }
    }
}
