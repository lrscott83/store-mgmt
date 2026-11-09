using Domain.Common.Limits;

namespace Application.Tests.Deployment
{
    /// <summary>
    /// Contrato de los límites de cuerpo del proxy que SÍ se despliega
    /// (<c>frontend-react/deploy/nginx.conf</c>): el API en general se queda en 8 MB y solo la
    /// ruta de sincronización sube a 52 MB.
    ///
    /// Es un test de CONTENIDO, no de comportamiento: nginx no se ejecuta en el entorno de
    /// pruebas, y <c>nginx -t</c> además abortaría aquí porque los <c>upstream</c> usan el DNS de
    /// Docker. Lo que este test impide es la deriva silenciosa: alguien sube otra vez el límite de
    /// todo <c>/api</c> y ninguna prueba lo nota hasta que el problema ya está en producción.
    ///
    /// <c>loadbalancer/nginx.conf</c> NO se comprueba a propósito: es legado congelado y ningún
    /// contenedor lo carga.
    /// </summary>
    public class NginxBodyLimitContractTests
    {
        private const long Megabyte = 1024L * 1024L;

        [Fact]
        public void The_deployed_proxy_caps_generic_api_bodies_at_eight_megabytes()
        {
            string apiBlock = ApiBlock();

            Assert.Contains("client_max_body_size 8m;", apiBlock);
            Assert.DoesNotContain("client_max_body_size 52m;", apiBlock);
        }

        [Fact]
        public void The_deployed_proxy_raises_the_limit_only_for_the_sync_files_route()
        {
            string config = DeployedConfig();

            int sync = config.IndexOf("location /api/v1/sync/files {", StringComparison.Ordinal);
            Assert.True(sync >= 0, "El bloque de la ruta de sincronización no existe.");

            string syncBlock = config[sync..];
            Assert.Contains("client_max_body_size 52m;", syncBlock);
        }

        [Fact]
        public void The_sync_ceiling_covers_the_file_limit_plus_the_multipart_overhead()
            => Assert.True(52L * Megabyte > StoreSyncFileLimits.MaxFileSizeInBytes + 65536);

        private static string ApiBlock()
        {
            string config = DeployedConfig();
            int start = config.IndexOf("location /api {", StringComparison.Ordinal);
            Assert.True(start >= 0, "El bloque /api no existe.");

            int end = config.IndexOf("client_max_body_size", start, StringComparison.Ordinal);
            Assert.True(end > start, "El bloque /api no declara client_max_body_size.");

            return config[start..(config.IndexOf(';', end) + 1)];
        }

        private static string DeployedConfig()
            => File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend-react", "deploy", "nginx.conf"))
                .Replace("\r\n", "\n", StringComparison.Ordinal);

        /// <summary>
        /// La raíz del repositorio se busca hacia arriba desde el directorio de la prueba: la ruta
        /// absoluta del checkout no se puede fijar en un test que corre en cualquier máquina.
        /// </summary>
        private static string RepositoryRoot()
        {
            DirectoryInfo? directory = new(AppContext.BaseDirectory);

            while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "loadbalancer", "nginx.conf")))
                directory = directory.Parent;

            Assert.NotNull(directory);
            return directory!.FullName;
        }
    }
}
