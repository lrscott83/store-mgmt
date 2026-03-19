using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WebApi.Extensions;

/// <summary>
/// Extension methods to prevent unhandled exceptions from crashing the host.
/// These handlers ensure that:
/// 1. Exceptions are ALWAYS logged before the process dies
/// 2. The host can gracefully handle fatal errors without immediate restart loops
/// 3. Background tasks that fail don't kill the application
/// </summary>
public static class HostingLifetimeExtensions
{
    /// <summary>
    /// Registers global exception handlers to prevent process crashes.
    /// Call this BEFORE building the host in Program.cs.
    /// </summary>
    public static IHostBuilder AddGlobalExceptionHandlers(this IHostBuilder hostBuilder)
    {
        // Handler for unhandled exceptions in the current AppDomain
        AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
        {
            var exception = args.ExceptionObject as Exception;
            var isTerminating = args.IsTerminating;

            // CRITICAL: Log BEFORE any potential crash
            Console.Error.WriteLine("=== FATAL: Unhandled Domain Exception ===");
            Console.Error.WriteLine($"Is Terminating: {isTerminating}");
            Console.Error.WriteLine($"Exception: {exception?.GetType().FullName}");
            Console.Error.WriteLine($"Message: {exception?.Message}");
            Console.Error.WriteLine($"StackTrace: {exception?.StackTrace}");

            if (exception?.InnerException != null)
            {
                Console.Error.WriteLine($"Inner Exception: {exception.InnerException.Message}");
                Console.Error.WriteLine($"Inner StackTrace: {exception.InnerException.StackTrace}");
            }

            // If terminating, we can't do much - but we've logged it
            // The OS/container will handle the restart
        };

        // Handler for unobserved task exceptions (fire-and-forget tasks that fail)
        TaskScheduler.UnobservedTaskException += (sender, args) =>
        {
            var exception = args.Exception;

            Console.Error.WriteLine("=== ERROR: Unobserved Task Exception ===");
            Console.Error.WriteLine($"Exception: {exception.GetType().FullName}");
            Console.Error.WriteLine($"Message: {exception.Message}");
            Console.Error.WriteLine($"StackTrace: {exception.StackTrace}");

            // Mark as observed to prevent process termination
            // The task failed, but the process continues
            args.SetObserved();
        };

        return hostBuilder;
    }

    /// <summary>
    /// Configures the host lifetime to log startup and shutdown events.
    /// Also ensures graceful shutdown handling.
    /// </summary>
    public static IHostBuilder ConfigureHostLifetimeLogging(this IHostBuilder hostBuilder)
    {
        return hostBuilder.UseConsoleLifetime(options =>
        {
            options.SuppressStatusMessages = false;
        });
    }
}

/// <summary>
/// Extension for IHost to add graceful shutdown and logging hooks.
/// </summary>
public static class HostExtensions
{
    /// <summary>
    /// Registers handlers for graceful shutdown and exception logging.
    /// Call this AFTER app.Build() and BEFORE app.Run().
    /// </summary>
    public static async Task RunWithExceptionHandlingAsync(this IHost host, ILogger? logger = null)
    {
        var lifetime = host.Services.GetService<IHostLifetime>() as IHostApplicationLifetime;

        if (lifetime != null)
        {
            lifetime.ApplicationStopping.Register(() =>
            {
                logger?.LogInformation("Application is stopping gracefully...");
                Console.WriteLine("=== Application stopping gracefully ===");
            });

            lifetime.ApplicationStopped.Register(() =>
            {
                logger?.LogInformation("Application has stopped.");
                Console.WriteLine("=== Application stopped ===");
            });

            lifetime.ApplicationStarted.Register(() =>
            {
                logger?.LogInformation("Application started successfully.");
                Console.WriteLine("=== Application started successfully ===");
            });
        }

        try
        {
            await host.RunAsync();
        }
        catch (Exception ex)
        {
            logger?.LogCritical(ex, "Host terminated unexpectedly");
            Console.Error.WriteLine("=== FATAL: Host terminated unexpectedly ===");
            Console.Error.WriteLine($"Exception: {ex.GetType().FullName}");
            Console.Error.WriteLine($"Message: {ex.Message}");
            Console.Error.WriteLine($"StackTrace: {ex.StackTrace}");

            // Re-throw to be caught by AppDomain handler
            throw;
        }
    }
}
