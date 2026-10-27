using System.Text.RegularExpressions;
using FluentAssertions;

namespace Application.Tests.Features.StoreSync;

/// <summary>
/// Guarda de paridad entre el script SQL versionado y la migración EF que dice reflejar
/// (hallazgo R3-script-migration-parity del review del esquema).
///
/// La regla del repo es que la migración es la fuente y el script se GENERA de ella. Ese contrato se
/// rompe en silencio: alguien retoca la migración, no regenera el script, y el desfase solo aparece
/// al ejecutarlo contra una base real. No se puede invocar `dotnet ef` desde un test unitario (lento,
/// exige SDK y build), así que se comprueba lo que de verdad se desincroniza: que TODO objeto que la
/// migración crea —tablas, índices, claves y restricciones— aparece con su nombre exacto en el script.
///
/// No demuestra igualdad byte a byte de tipos y nulabilidad; eso lo cubre la regeneración manual y la
/// cabecera del propio script.
/// </summary>
public class StoreSyncScriptMigrationParityTests
{
    private static readonly Regex CreatedObjectName =
        new("name:\\s*\"(?<name>[^\"]+)\"", RegexOptions.Compiled);

    [Theory]
    [InlineData("20261027154811_Add-StoreSyncFiles", "42-20261027-Add-StoreSyncFiles.sql")]
    [InlineData("20261027183707_StoreSyncFileDownload-TenantForeignKey",
        "43-20261027-StoreSyncFileDownload-TenantForeignKey.sql")]
    public void Script_should_name_every_object_the_migration_creates(string migrationName, string scriptName)
    {
        string migration = Read("src", "Infrastructure", "Migrations", migrationName + ".cs");
        string script = Read("scripts", scriptName);

        script.Should().Contain(migrationName,
            "el script tiene que registrar la migración que aplica");

        string[] created = CreatedObjectName.Matches(migration)
            .Select(match => match.Groups["name"].Value)
            .Distinct()
            .ToArray();

        created.Should().NotBeEmpty("la migración declara al menos una tabla");

        foreach (string objectName in created)
            script.Should().Contain($"\"{objectName}\"",
                "el script debe crear '{0}' tal como lo declara la migración", objectName);

        // La idempotencia del script es una regla del repo, no un detalle: sin ella, ejecutarlo dos
        // veces falla en la clave primaria del historial.
        script.Should().Contain("ON CONFLICT (\"MigrationId\") DO NOTHING",
            "el script tiene que ser idempotente");
    }

    private static string Read(params string[] segments)
    {
        string root = FindBackendRoot();
        string path = Path.Combine(new[] { root }.Concat(segments).ToArray());

        File.Exists(path).Should().BeTrue($"se esperaba el fichero '{path}'");

        return File.ReadAllText(path);
    }

    /// <summary>
    /// Sube desde el directorio del ensamblado de test hasta encontrar la raíz del backend, para no
    /// depender de la profundidad de `bin/Debug/net8.0` ni del directorio de trabajo del runner.
    /// </summary>
    private static string FindBackendRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);

        while (directory is not null)
        {
            if (Directory.Exists(Path.Combine(directory.FullName, "src", "Infrastructure", "Migrations")))
                return directory.FullName;

            if (Directory.Exists(Path.Combine(directory.FullName, "backend", "src", "Infrastructure", "Migrations")))
                return Path.Combine(directory.FullName, "backend");

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "No se encontró la raíz del backend subiendo desde " + AppContext.BaseDirectory);
    }
}
