using Domain.Common.Results;

namespace Domain.Entities.Users
{
    public class UserErrors
    {
        public static Error LoginNotFound(string login) 
            => new("User.NotFound", $"El usuario '{login}' no existe en el sistema.");

        public static readonly Error NotFound = new("User.NotFound", $"El usuario no existe.");
        public static readonly Error Inactive = new("User.Inactive", $"El usuario está inactivo.");
        public static Error InvalidPassword(string login) 
            => new("User.InvalidPassword", $"La contraseña del usuario '{login}' no es válida.");
    }
}
