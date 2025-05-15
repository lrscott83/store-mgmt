using Domain.Common.Results;
using FluentValidation.Results;

namespace Application.Exceptions
{
    public class ValidationException : ApiException
    {
        public ValidationException(string message = null) 
            : base(message != null ? message :"One or more validation failures have occurred.")
        {
            Errors = new List<Error>();
        }
        public List<Error> Errors { get; set; }    

        public ValidationException(IEnumerable<ValidationFailure> failures)
            : this()
        {
            foreach (var failure in failures)
            {
                Errors.Add(new Error(failure.PropertyName, failure.ErrorMessage));
            }
        }

    }
}
