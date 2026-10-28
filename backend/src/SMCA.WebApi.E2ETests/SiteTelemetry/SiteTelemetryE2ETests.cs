using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.SiteTelemetry;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.SiteTelemetry;

/// <summary>
/// Telemetría del sitio público: el beacon del cliente escribe las visitas a las páginas de la
/// lista cerrada, y el middleware del servidor cuenta las DOS entradas del manual (HTML y PDF)
/// sin contar sus imágenes ni las revalidaciones 304.
///
/// La tabla es site-wide (sin tienda), así que la limpieza se hace por ventana de tiempo: cada
/// test captura `since` antes de actuar y borra lo que cayó en esa ventana.
///
/// Casos deliberadamente NO cubiertos aquí: el límite de tasa (`429` de `PublicCatalogPolicy`).
/// La política cuenta por IP y ventana, así que un test que la agota contamina a los demás que
/// comparten cliente; se prueba en su propia política, no en este archivo.
/// </summary>
[Collection("e2e")]
public sealed class SiteTelemetryE2ETests
{
    private const string BrowserUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

    private const string GoogleBotUserAgent =
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

    private const string ManualHtmlPath = "/api/manual/";
    private const string ManualPdfPath = "/api/manual/manual-usuario-pos.pdf";

    private readonly AppTestFactory _f;

    public SiteTelemetryE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Beacon_records_only_the_tracked_public_pages()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            var response = await anon.PostAsJsonAsync("/api/v1/public/site/events", new
            {
                events = new object[]
                {
                    new { name = "page_view", path = "/" },
                    new { name = "page_view", path = "/login", utmSource = "whatsapp" },
                    // Fuera de la lista cerrada: no se guarda.
                    new { name = "page_view", path = "/diagnostics" },
                    new { name = "page_view", path = "/help/tutorial" },
                    // El manual no entra por el beacon: lo escribe el servidor.
                    new { name = "manual_view", path = "/api/manual/" },
                },
            });

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            List<SiteEvent> rows = await RecentAsync(since);

            rows.Should().HaveCount(2);
            rows.Select(row => row.Path).Should().BeEquivalentTo(["/", "/login"]);
            rows.Should().OnlyContain(row => row.Kind == SiteEventKind.PageView);
            rows.Single(row => row.Path == "/login").Source.Should().Be(CatalogSource.WhatsApp);
            rows.Should().OnlyContain(row => row.VisitorHash.Length == SiteEvent.HashMaxLength);
            rows.Should().OnlyContain(row => row.SessionHash.Length == SiteEvent.HashMaxLength);
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Beacon_with_a_bot_user_agent_writes_nothing()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var bot = _f.CreateClient();
            bot.DefaultRequestHeaders.UserAgent.ParseAdd(GoogleBotUserAgent);

            var response = await bot.PostAsJsonAsync("/api/v1/public/site/events", new
            {
                events = new object[] { new { name = "page_view", path = "/" } },
            });

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            (await RecentAsync(since)).Should().BeEmpty();
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Beacon_with_only_untracked_pages_writes_nothing()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            var response = await anon.PostAsJsonAsync("/api/v1/public/site/events", new
            {
                events = new object[]
                {
                    new { name = "page_view", path = "/help/tutorial" },
                    new { name = "page_view", path = "/auth/provision" },
                    new { name = "page_view", path = "/no-existe" },
                },
            });

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            (await RecentAsync(since)).Should().BeEmpty();
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Beacon_with_an_empty_batch_writes_nothing()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            var response = await anon.PostAsJsonAsync("/api/v1/public/site/events",
                new { events = Array.Empty<object>() });

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            (await RecentAsync(since)).Should().BeEmpty();
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Beacon_with_malformed_entries_still_saves_the_valid_ones()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();
            const string body = """
                {"events":[null,{"name":"page_view"},{"name":"page_view","path":"/register"},{"name":null,"path":"/login"}]}
                """;

            var response = await anon.PostAsync("/api/v1/public/site/events",
                new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            List<SiteEvent> rows = await RecentAsync(since);
            rows.Should().ContainSingle();
            rows[0].Path.Should().Be("/register");
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Beacon_drops_an_absolute_url_instead_of_persisting_it()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            var response = await anon.PostAsJsonAsync("/api/v1/public/site/events", new
            {
                events = new object[]
                {
                    new { name = "page_view", path = "https://evil.example/login" },
                    new { name = "page_view", path = "/login" },
                },
            });

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            List<SiteEvent> rows = await RecentAsync(since);
            rows.Should().ContainSingle();
            rows[0].Path.Should().Be("/login");
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Beacon_keeps_one_visitor_and_one_session_for_the_same_client()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            await anon.PostAsJsonAsync("/api/v1/public/site/events",
                new { events = new object[] { new { name = "page_view", path = "/" } } });
            await anon.PostAsJsonAsync("/api/v1/public/site/events",
                new { events = new object[] { new { name = "page_view", path = "/login" } } });

            List<SiteEvent> rows = await RecentAsync(since);

            rows.Should().HaveCount(2);
            rows.Select(row => row.VisitorHash).Distinct().Should().ContainSingle();
            rows.Select(row => row.SessionHash).Distinct().Should().ContainSingle();
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Manual_html_and_pdf_are_two_entries_and_images_are_not_counted()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            (await anon.GetAsync(ManualHtmlPath)).StatusCode.Should().Be(HttpStatusCode.OK);
            (await anon.SendAsync(new HttpRequestMessage(HttpMethod.Head, ManualPdfPath)))
                .StatusCode.Should().Be(HttpStatusCode.OK);
            (await anon.GetAsync("/api/manual/images/01-crear-cuenta.webp")).StatusCode
                .Should().Be(HttpStatusCode.OK);

            List<SiteEvent> rows = await RecentAsync(since);

            rows.Should().HaveCount(2);
            rows.Should().OnlyContain(row => row.Kind == SiteEventKind.ManualView);
            rows.Select(row => row.Path).Should().BeEquivalentTo([ManualHtmlPath, ManualPdfPath]);
            rows.Should().OnlyContain(row => row.StatusCode == 200);
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Manual_without_the_trailing_slash_is_the_same_entry()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            (await anon.GetAsync("/api/manual")).StatusCode.Should().Be(HttpStatusCode.OK);

            List<SiteEvent> rows = await RecentAsync(since);
            rows.Should().ContainSingle();
            rows[0].Path.Should().Be(ManualHtmlPath);
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Manual_revalidation_with_304_is_not_a_new_entry()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            var first = await anon.GetAsync(ManualHtmlPath);
            first.StatusCode.Should().Be(HttpStatusCode.OK);
            var etag = first.Headers.ETag;
            etag.Should().NotBeNull("el middleware de estáticos emite ETag y el manual revalida");

            var conditional = new HttpRequestMessage(HttpMethod.Get, ManualHtmlPath);
            conditional.Headers.IfNoneMatch.Add(etag!);
            var second = await anon.SendAsync(conditional);
            second.StatusCode.Should().Be(HttpStatusCode.NotModified);

            List<SiteEvent> rows = await RecentAsync(since);
            rows.Should().ContainSingle("solo la carga 200 es una entrada");
            rows[0].StatusCode.Should().Be(200);
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Manual_requested_by_a_bot_is_not_counted()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var bot = _f.CreateClient();
            bot.DefaultRequestHeaders.UserAgent.ParseAdd(GoogleBotUserAgent);

            (await bot.GetAsync(ManualHtmlPath)).StatusCode.Should().Be(HttpStatusCode.OK);

            (await RecentAsync(since)).Should().BeEmpty();
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    [Fact]
    public async Task Manual_unknown_file_is_not_counted()
    {
        DateTime since = DateTime.UtcNow.AddMinutes(-1);
        try
        {
            var anon = BrowserClient();

            (await anon.GetAsync("/api/manual/otro.html")).StatusCode.Should()
                .Be(HttpStatusCode.NotFound);

            (await RecentAsync(since)).Should().BeEmpty();
        }
        finally
        {
            await DeleteSinceAsync(since);
        }
    }

    private HttpClient BrowserClient()
    {
        var client = _f.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd(BrowserUserAgent);
        return client;
    }

    private async Task<List<SiteEvent>> RecentAsync(DateTime since)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<SiteEvent>()
            .Where(row => row.OccurredAt >= since)
            .ToListAsync();
    }

    private async Task DeleteSinceAsync(DateTime since)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<SiteEvent>()
            .Where(row => row.OccurredAt >= since)
            .ExecuteDeleteAsync();
    }
}
