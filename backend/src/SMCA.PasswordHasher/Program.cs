using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

const string Usage =
    "Usage: dotnet run --project backend/src/SMCA.PasswordHasher -- \"<password>\" [environment]\n" +
    "\n" +
    "  Hashes <password> with the same Argon2id settings the running API uses, and prints\n" +
    "  the PHC-format hash to stdout. Quote the password so it is not split on spaces.\n" +
    "\n" +
    "  [environment] selects which appsettings layer is applied on top of the base file,\n" +
    "  exactly like ASPNETCORE_ENVIRONMENT does for the API. It falls back to the\n" +
    "  ASPNETCORE_ENVIRONMENT variable, and then to Production (the ASP.NET Core default).\n" +
    "\n" +
    "  This matters: the pepper is part of the hash, so a hash generated under one\n" +
    "  environment does not verify under another.\n" +
    "\n" +
    "  Examples:\n" +
    "    ... -- \"MyPassword\" Development   # for your local database\n" +
    "    ... -- \"MyPassword\" Tests         # for the E2E database (smca_test)\n" +
    "    ... -- \"MyPassword\"               # for the VPS (Production)";

if (args.Length is 0 or > 2 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.Error.WriteLine(Usage);
    return 1;
}

var password = args[0];

// Same precedence the API applies: base file, then the environment overlay, then env vars.
var environment = args.Length == 2 && !string.IsNullOrWhiteSpace(args[1])
    ? args[1]
    : Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";

var basePath = AppContext.BaseDirectory;
var overlayPath = Path.Combine(basePath, $"appsettings.{environment}.json");

var configuration = new ConfigurationBuilder()
    .AddJsonFile(Path.Combine(basePath, "appsettings.json"), optional: false)
    .AddJsonFile(overlayPath, optional: true)
    .AddEnvironmentVariables()
    .Build();

var settings = new AuthenticationSettings();
configuration.GetSection(AuthenticationSettings.SectionName).Bind(settings);

if (string.IsNullOrEmpty(settings.Pepper))
{
    Console.Error.WriteLine(
        $"Refusing to hash: no {AuthenticationSettings.SectionName}:Pepper resolved for environment " +
        $"'{environment}'. The resulting hash would not verify against the API.");
    return 1;
}

// Report what was actually loaded — a hash generated against the wrong layer looks identical
// to a correct one, and only fails much later at login.
var overlayState = File.Exists(overlayPath) ? "applied" : "not found";

Console.Error.WriteLine(
    $"environment: {environment} (appsettings.{environment}.json {overlayState})\n" +
    $"argon2id  m={settings.Argon2MemoryKib} KiB  t={settings.Argon2TimeCost}  " +
    $"p={settings.Argon2Parallelism}  salt={settings.Argon2SaltBytes}B  hash={settings.Argon2HashBytes}B");

IHashPasswordService hasher = new Argon2idHashPasswordService(Options.Create(settings));
var hash = hasher.HashPassword(password);

Console.WriteLine(hash);
return 0;
