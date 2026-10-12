namespace Application.Exceptions
{
    /// <summary>
    /// El lock de escritura de un conjunto del showcase NO se pudo tomar dentro del tiempo máximo de
    /// espera: otra petición está modificando el MISMO conjunto.
    ///
    /// La lanza la infraestructura —que es quien conoce el lock de PostgreSQL— y la traduce el handler
    /// de alta a un 409 localizado. Vive en Application, y no como <see cref="ApiException"/> lanzada
    /// desde el repositorio, para que el mensaje siga naciendo del <c>IStringLocalizer</c> que solo
    /// tiene el handler.
    /// </summary>
    public sealed class ShowcaseSetBusyException : Exception
    {
        public ShowcaseSetBusyException(string message, Exception innerException)
            : base(message, innerException)
        {
        }
    }
}
