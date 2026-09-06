# Backend Exception Alerts via Telegram — Research & Implementation Plan

Date: 2026-09-05
Status: Proposed — not implemented. No code touched. Backend
production changes listed here require explicit user authorization
before implementation (repo rule, CLAUDE.md).

## Goal

Every unhandled backend exception — the ones
`ErrorHandlerMiddleware` already logs at `Error` level — arrives
as a message in a private Telegram channel, so a production
failure is seen within seconds instead of at the next log review.

## Verified current state (facts, not assumptions)

- **`ErrorHandlerMiddleware.cs`** (`backend/src/SMCA.WebApi/Middlewares/`)
  is the single global catch-all:
  - unhandled exceptions → `_logger.LogError(...)` with exception
    type, message and stack trace (lines 66-76, inner exception too);
  - `ValidationException`/`ApiException` → `LogWarning` (client
    errors — NOT alert-worthy);
  - client disconnects → `LogDebug` (routine, correctly silenced).
- **Serilog** is the logger, built **manually** in
  `Program.cs:37-47`: `ReadFrom.Configuration(...)` (reads the
  `Serilog` appsettings section: Console + two level-scoped File
  sub-loggers) and then chains `.WriteTo.Elasticsearch(...)`. This
  manual builder is the seam where a new sink registers.
- **appsettings.json** already splits sinks by level: `ex_.log`
  (Error/Fatal/Warning) vs `cp_.log` (Info/Debug) — precedent for a
  level-scoped sink.
- **No BackgroundService exists** (the outbox is only a
  `SaveChangesInterceptor` writing rows) — the HTTP pipeline is the
  only exception source today. A Serilog sink still beats a
  middleware-only hook: it also covers startup failures and any
  future worker, with zero coupling.
- **Production has no working remote alerting today:**
  - `docker-compose.yml` defines NO elasticsearch service; the ES
    sink's host `smca_elasticsearch` resolves nowhere in that
    network (silently failing/retrying).
  - The `Logs/` directory has no compose volume — `ex_.log` dies
    with the container.
- **Secrets pattern**: compose passes secrets as env vars with
  `__` separators (`StoreEncryption__MasterSecret`,
  `docker-compose.yml:30-56`, `.env.example`) — the bot token must
  follow the same pattern and never be committed.
- Prod connection string runs `Include Error Detail=false`
  (compose line 42) so PostgreSQL parameter values do not leak
  into exception messages — good default for channel-bound logs.

## Design decisions

### D1 — Hand-rolled sink vs `Serilog.Sinks.Telegram` (NuGet)

| Option | Facts (NuGet-verified 2026-09-05) | Verdict |
|---|---|---|
| `Serilog.Sinks.Telegram` 0.2.1 | Last updated **2020**, netstandard2.0, drags `Flurl.Http 2.4.2` (2018-era) into the graph, ~80K downloads, unmaintained | REJECTED — stale transitive deps for a feature that is one HTTP POST |
| Hand-rolled `TelegramAlertSink` (~100 LOC + ~60 LOC throttler) | Zero new packages; BCL `HttpClient`; matches this repo's pattern of owning well-understood primitives (frontend hand-rolls AES-GCM/PBKDF2/base64; backend hand-rolls key-wrap providers) | **CHOSEN** |

### D2 — Hook point: Serilog sink, filtered to `Error`+`Fatal`

Registered in `Program.cs` next to the ES sink, restricted to
minimum level `Error` — catches middleware exceptions AND startup
failures AND anything else logged at Error, while excluding the
Warning-level client-error noise (`ValidationException`,
`ApiException`) and the Debug-level disconnect noise.

### D3 — Throttle + dedup (error storms must not spam)

A PostgreSQL outage would otherwise fire hundreds of messages
(Telegram hard-blocks bots around 30 msg/s and blackholes
repeated identical text for growing periods). The sink owns a
small pure class `TelegramAlertThrottler`:

- **Min-interval** between sends (default 5 s). Events arriving
  inside the window are coalesced, never silently lost: the next
  sent message ends with "… +N more errors suppressed".
- **Dedup**: identical `ExceptionType + Message` inside a window
  (default 10 min) → counted, not re-sent.
- Bounded in-memory queue (256 events, drop-oldest + counter) so
  a storm can never balloon memory.

### D4 — Failure isolation (the sink may never hurt the app)

- `Emit` never blocks and never throws: events go to a
  `ConcurrentQueue` drained by ONE background `Task` (fire-and-
  forget, `try/catch` around the POST).
- One shared static `HttpClient`, 10 s timeout (Telegram is not
  on the critical path; the middleware's `LogError` call must not
  add request latency).
- **Circuit breaker**: after 5 consecutive send failures, back
  off 5 min (unreachable Telegram must not become a busy loop).
- Send failures are swallowed in Production; in Development they
  go to `Serilog.Debugging.SelfLog` for diagnosis.

### D5 — Config & secrets

```json
"TelegramAlerts": {
  "Enabled": false,
  "BotToken": "",
  "ChatId": "",
  "MinIntervalSeconds": 5,
  "DedupWindowMinutes": 10
}
```

- `Enabled: false` in every committed appsettings — opt-in per
  environment; rollback = flip one env var, no rebuild.
- Compose/env overrides: `TelegramAlerts__Enabled`,
  `TelegramAlerts__BotToken`, `TelegramAlerts__ChatId` (same
  `__` convention as `StoreEncryption__MasterSecret`).
- The token is a credential (anyone holding it can post as the
  bot): env var / user-secret only, NEVER in a committed file.

### D6 — Message format & security

Plain text, NO `parse_mode` — exception messages are
user-influencable and `parse_mode: HTML` would be a markup
injection vector. Example message:

```
🚨 SMCA [Production] Unhandled exception
Type: Npgsql.NpgsqlException
Message: Connection refused
Route: GET /api/v1/products → 500
Host: smca_backend
Time: 2026-09-05T15:42:07Z
+3 more errors suppressed (10 min window)
Stack (top 5):
   at Npgsql.NpgsqlConnection.Open(...)
   at ...cs:line 42
```

- Stack trimmed to top 5 frames (channel message limit is 4096
  chars).
- Never include: request bodies, tokens, connection strings,
  headers. Prod already runs `Include Error Detail=false`.

### D7 — Code location

- `backend/src/SMCA.WebApi/Logging/TelegramAlertOptions.cs`
- `backend/src/SMCA.WebApi/Logging/TelegramAlertThrottler.cs` (pure, unit-testable)
- `backend/src/SMCA.WebApi/Logging/TelegramAlertSink.cs`
- Registration: `Program.cs` after line 46, inside an
  `if (enabled && token && chatId)` gate, with one
  `LogInformation("Telegram alerts enabled")` at boot as the
  deploy-verification line.

WebApi project only — no Domain/Application/Infrastructure
pollution.

## Implementation tasks (ordered)

1. **Manual Telegram setup** (section below — do it FIRST; the
   curl test proves token+chat_id before any code exists).
2. `TelegramAlertOptions` + `appsettings.json` /
   `appsettings.Development.json` defaults (`Enabled: false`).
3. `TelegramAlertThrottler` (pure logic: min-interval, dedup,
   coalescing counter, bounded queue).
4. `TelegramAlertSink` (queue + background drain task + circuit
   breaker + message formatter).
5. `Program.cs` gated registration.
6. **Unit tests** — new project
   `backend/src/SMCA.WebApi.Tests/` (xunit): throttler behavior
   (storm coalescing, dedup window, queue bound), formatter output
   (type/message/route, 4096 cap, no parse_mode). No HTTP in tests —
   the HTTP client is injected as a `Func<HttpRequestMessage,
   Task<HttpResponseMessage>>` delegate. NO new E2E test: there is
   no deterministic public-API way to force an unhandled 500, and
   adding a deliberate throw endpoint to production code just for
   a test is a smell. (New unit tests are the allowed addition;
   backend production code itself needs the user's approval — this
   plan is that approval request.)
7. `docker-compose.yml` + `.env.example` env-var wiring.
8. Deploy + production verification (manual steps below).

## Manual steps — one by one

### A. Create the bot (Telegram, any client, ~2 min)

1. Open Telegram, search for **@BotFather** (blue-verified official
   bot) → open chat → press **Start**.
2. Send: `/newbot`
3. BotFather asks for a display name → type e.g.
   `SMCA Alerts Bot`.
4. BotFather asks for a username (must end in `bot`) → type e.g.
   `smca_alerts_bot`.
5. BotFather replies with an API token like
   `1234567890:AAE3fG...` → **copy it, treat it as a password.**
6. (Hardening, optional) Send `/mybots` → select the bot → **Bot
   Settings → Allow Groups? → Turn off** if you want it
   channel-only. Keep "Bot Father → /revoke" in mind: a leaked
   token is revoked and reissued there, no code change needed.

### B. Create the channel and wire the bot (~3 min)

1. Telegram → hamburger menu → **New Channel**.
2. Name it e.g. `SMCA Producción Alertas` → **Private channel**
   (a public channel is discoverable by anyone — rejected for
   ops alerts).
3. Open the channel → tap the channel name → **Administrators →
   Add Admin** → search your bot's username (`@smca_alerts_bot`)
   → add it with at least **Post Messages** permission → confirm.
4. **Post any message in the channel** (e.g. "hola") — the bot
   can only see activity from the moment it became admin, and
   `getUpdates` needs at least one event to expose the chat_id.
5. In a browser open:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   (replace `<TOKEN>` with the real token).
6. In the JSON, find `"chat":{"id":-100XXXXXXXXXX,"title":"SMCA
   Producción Alertas"}` → that negative `-100…` number is the
   **chat_id**. Copy it.
   - If `getUpdates` returns `{"result":[]}`: post another message
     in the channel and reload.
   - Alternative: forward any channel message to **@userinfobot**
     — it replies with the original chat id.

### C. Prove it works BEFORE writing any code (~1 min)

PowerShell (this machine):

```powershell
$token = "PASTE_TOKEN"
$chat  = "PASTE_CHAT_ID"   # e.g. -1001234567890
Invoke-RestMethod -Method Post `
  -Uri "https://api.telegram.org/bot$token/sendMessage" `
  -Body @{ chat_id = $chat; text = "SMCA alert test" }
```

Expected: the response has `"ok":true` and the message appears
in the channel. **Do not proceed to implementation until this
step passes** — it proves token, chat_id and network egress.

### D. Wire the secrets (dev + prod)

1. **Never commit the token.** Check `.gitignore` covers `.env`
   (it does today).
2. Local dev (this machine, no file edits):
   ```powershell
   $env:TelegramAlerts__Enabled  = "true"
   $env:TelegramAlerts__BotToken = "<token>"
   $env:TelegramAlerts__ChatId   = "<chat_id>"
   ```
   before `dotnet run` (env vars outrank appsettings — same
   mechanism compose uses).
3. Server `.env` (next to docker-compose.yml): append
   ```env
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_CHAT_ID=<chat_id>
   ```
4. `docker-compose.yml`, `api:` service `environment:` list —
   add (with the same comment style as the existing entries):
   ```yaml
   - TelegramAlerts__Enabled=true
   - TelegramAlerts__BotToken=${TELEGRAM_BOT_TOKEN}
   - TelegramAlerts__ChatId=${TELEGRAM_CHAT_ID}
   ```

### E. Deploy & verify in production (after implementation)

1. Build the new image (compose runs a prebuilt image, build
   section is commented out):
   `docker build -t localhost/store-mgmt_backend:latest ./backend/src`
2. `docker compose up -d api`
3. Confirm the boot line: `docker compose logs api | grep -i
   "Telegram alerts enabled"` — its absence means the gate closed
   (bad env var name — double-check `__`).
4. **End-to-end trigger** (deliberate, controlled):
   1. `docker compose stop postgres`
   2. Open the app in a browser and hit any API-backed page
      (or `curl http://<host>:8083/api/v1/ping`… any request that
      touches the DB).
   3. Expected in Telegram: ONE alert message (Npgsql connection
      refused) within seconds, then — while requests keep
      failing — the coalescing footer ("+N more errors
      suppressed"), NOT a message per request.
   4. `docker compose start postgres` — recovery needs no action.
5. **Rollback** (if anything misbehaves): set
   `TelegramAlerts__Enabled=false` in `.env` → `docker compose up
   -d api`. Fully gated, no rebuild.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Error storm floods the channel / Telegram bans the bot | Throttle + dedup + coalescing (D3) |
| Telegram unreachable | Circuit breaker + fire-and-forget queue; app latency unaffected (D4) |
| Token leak | Env vars/user-secrets only; revocation is a BotFather `/revoke`, no code change |
| Markup injection via exception text | Plain text, no `parse_mode` (D6) |
| PII in messages (login names, emails inside exception text) | Acceptable for a private internal ops channel; message includes no request bodies; documented here as a conscious decision |
| Latency added to error paths | Background drain task — `Emit` only enqueues (D4) |

## Out of scope

- Frontend error reporting (separate channel/plan if wanted).
- Two-way bot commands (ack/mute from Telegram).
- Rich formatting / message threading.
- Replacing/repairing the Elasticsearch sink (its dead host in
  compose is a separate finding; fixing it is NOT this change).

## Effort estimate

- Code: ~160 LOC production + ~120 LOC tests, one new test
  project file + csproj.
- Manual: ~6 min Telegram setup (A–C), ~10 min deploy+verify (E).
