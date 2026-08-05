using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

const string Usage =
    "Usage: dotnet run --project backend/src/SMCA.PasswordHasher -- \"<password>\"\n" +
    "  Hashes <password> with the same Argon2id settings the running API uses\n" +
    "  (backend/src/SMCA.WebApi/appsettings.json, + appsettings.Production.json on the VPS)\n" +
    "  and prints the PHC-format hash to stdout. Exactly one argument is required —\n" +
    "  quote the password so it is not split on spaces.";

if (args.Length != 1 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.Error.WriteLine(Usage);
    return 1;
}

var password = args[0];

var configuration = new ConfigurationBuilder()
    .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: false)
    .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.Production.json"), optional: true)
    .AddEnvironmentVariables()
    .Build();

var settings = new AuthenticationSettings();
configuration.GetSection(AuthenticationSettings.SectionName).Bind(settings);

var pepperPresence = string.IsNullOrEmpty(settings.Pepper) ? "absent" : "present";

Console.Error.WriteLine(
    $"argon2id  m={settings.Argon2MemoryKib} KiB  t={settings.Argon2TimeCost}  " +
    $"p={settings.Argon2Parallelism}  salt={settings.Argon2SaltBytes}B  hash={settings.Argon2HashBytes}B  " +
    $"pepper: {pepperPresence} (source: appsettings.json)");

IHashPasswordService hasher = new Argon2idHashPasswordService(Options.Create(settings));
var hash = hasher.HashPassword(password);

Console.WriteLine(hash);
return 0;
