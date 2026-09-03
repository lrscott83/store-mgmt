# store-mgmt

## VPS — Comandos de administración

### 1. Backup de la base de datos

```bash
# Backup compactado (.sql.gz) en el directorio actual
podman exec smca_postgres_db pg_dump -U postgres smca | gzip > ./smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restaurar desde el directorio actual
gunzip -c ./smca_backup_YYYYMMDD_HHMMSS.sql.gz | podman exec -i smca_postgres_db psql -U postgres -d smca
```

### 2. Cambiar password del usuario admin

**Desde la app web (recomendado):**
1. Logueate como admin
2. Ve a `/profile/change-password`
3. Cambia la contraseña

**Desde la BD directamente:**
```bash
podman exec -it smca_postgres_db psql -U postgres -d smca -c "UPDATE \"User\" SET \"Password\" = \$\$HASH_ARGON2ID\$\$ WHERE \"Login\" = 'admin';"

podman exec -it smca_postgres_db psql -U postgres -d smca -c "UPDATE \"User\" SET \"Password\" = \$\$argon2id\$v=19\$m=65536,t=3,p=2\$...\$\$ WHERE \"Login\" = 'admin';"
```

### 3. Verificar migraciones pendientes

```bash
# Migraciones ya aplicadas en producción
podman exec -it smca_postgres_db psql -U postgres -d smca -c "SELECT \"MigrationId\" FROM \"__EFMigrationsHistory\" ORDER BY \"ProductVersion\";"
```

Las que NO aparezcan en esa lista son las que faltan correr.

### 4. Ejecutar migraciones

**Opción A — Con Entity Framework (recomendado si el backend está desplegado):**
```bash
cd /ruta/al/backend/src/SMCA.WebApi
dotnet ef database update --project ../Infrastructure --startup-project .
```

**Opción B — Con scripts SQL manuales (si EF no está disponible en el VPS):**
```bash
# Listar scripts disponibles
ls backend/scripts/

# Ejecutar un script específico (ej: el 08)
podman exec -i smca_postgres_db psql -U postgres -d smca < backend/scripts/08-20260806-Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays.sql
```

**Opción C — Aplicar todas las migraciones pendientes de una:**
```bash
# Desde el directorio del backend
cd /ruta/al/backend/src/SMCA.WebApi
dotnet ef database update --project ../Infrastructure --startup-project . --connection "Host=localhost;Port=5432;Database=smca;Username=postgres;Password=postgres"
```

> ⚠️ **IMPORTANTE:** Siempre haz backup ANTES de ejecutar migraciones:
> ```bash
> podman exec smca_postgres_db pg_dump -U postgres smca | gzip > ./smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz
> ```

### 5. Ver logs del backend

```bash
# Logs en tiempo real (últimas 100 líneas)
podman logs -f --tail 100 smca_backend

# Logs solo de errores
podman logs smca_backend 2>&1 | grep -i "error\|exception\|fail"

# Logs de una fecha específica
podman logs smca_backend 2>&1 | grep "2026-08-25"

# Logs de autenticación (útiles para debuggear login 400)
podman logs smca_backend 2>&1 | grep -i "auth\|login\|token"

# Últimas 50 líneas con timestamps
podman logs --tail 50 smca_backend 2>&1 | tail -50
```

**Nombres de containers:**
- Backend API: `smca_backend`
- Base de datos: `smca_postgres_db`

```bash
# Ver todos los containers corriendo
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 6. Limpiar tiendas, owners y usuarios (con rollback)

⚠️ **Úsalo solo en producción cuando necesites empezar de cero** (problemas con el wizard de setup, datos corruptos, etc.)

**Antes de ejecutar, haz un backup:**
```bash
podman exec smca_postgres_db pg_dump -U postgres smca | gzip > ./smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Paso 1: Ejecutar la limpieza**
```bash
# IMPORTANTE: Usa la misma conexión/sesión para todos los scripts
podman exec -i smca_postgres_db psql -U postgres -d smca < backend/scripts/09-delete-all-stores-users.sql
```

**Paso 2: Verificar el resultado**
```bash
podman exec -i smca_postgres_db psql -U postgres -d smca < backend/scripts/11-verify-cleanup.sql
```

**Si necesitas revertir (deshacer la limpieza):**
```bash
# ⚠️ Solo funciona si la conexión del paso 1 sigue abierta
# (las tablas temporales se borran al cerrar la conexión)
podman exec -i smca_postgres_db psql -U postgres -d smca < backend/scripts/10-revert-delete-stores-users.sql
```

**¿Qué hace cada script?**

| Script | Función |
|---|---|
| `09-delete-all-stores-users.sql` | Crea respaldos en tablas temporales, borra todos los datos (respeta Module, Feature, Role, Tenant, SystemConfiguration) |
| `10-revert-delete-stores-users.sql` | Restaura todos los datos desde las tablas temporales (solo funciona en la misma conexión) |
| `11-verify-cleanup.sql` | Verifica el estado de la BD, muestra conteos de todas las tablas |

**¿Qué se conserva?**
- Tablas Module, Feature, Role, Tenant (seed data)
- Tabla StorePaymentStatus (catálogo de estados)
- Tabla SystemConfiguration (configuraciones del sistema)
- Migraciones aplicadas (`__EFMigrationsHistory`)

**¿Qué se borra?**
- Todas las tablas: User, Owner, Store, ReSeller, UserRole, StoreUser, StoreModule, StoreRoleFeature, StorePayment, StoreUsage, ProductCategory, Product, Order, OrderItem, InventoryEntry, InventoryEntryCost, RefreshTokens, ReSellerOwner, OutboxMessage

---

### 7. Solucionar problemas comunes

**Backend apunta a BD de testing (smca_test) en vez de producción (smca):**

El archivo `appsettings.E2E.json` sobreescribe la conexión en cualquier entorno. Si existe en el VPS:
```bash
# Verificar
podman exec -it smca_backend ls /app/appsettings.E2E.json

# Eliminar
podman exec -it smca_backend rm /app/appsettings.E2E.json

# Reiniciar
podman restart smca_backend
```

**Verificar la conexión del backend a la BD:**
```bash
# Testear conexión desde el contenedor del backend
podman exec -it smca_backend pg_isready -h smca_postgres_db -p 5432

# Ver qué BD usa el backend
podman exec -it smca_backend cat /app/appsettings.json | grep -A2 ConnectionStrings
```

### 8. Conexión a la BD (referencia)

| Campo | Valor |
|---|---|
| Container | `smca_postgres_db` |
| DB | `smca` |
| User | `postgres` |
| Password | `postgres` |
| Port | `5432` |

```bash
# Conectar desde el host
psql -h localhost -p 5432 -U postgres -d smca

# Conectar desde Podman
podman exec -it smca_postgres_db psql -U postgres -d smca
```

---

## Suite de tests — ejecución manual

Pasos verificados (2026-09-03) para correr a mano toda la suite, en orden: checks y tests del backend, E2E del backend, checks y tests del frontend, E2E del frontend. Detalle profundo por suite: `docs/testing/README.md` y `frontend-react/e2e/README.md`.

### Prerrequisitos (una sola vez)

- .NET SDK 8, Node.js >= 22, pnpm 10.x
- PostgreSQL corriendo en `localhost:5432` (`postgres`/`postgres`)
- La base `smca_test` debe existir (los tests aplican las migraciones ellos mismos, pero no crean la base):
  ```bash
  psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE smca_test;"
  # ignora el error si ya existe
  ```
- Dependencias del frontend y navegador de Playwright:
  ```bash
  cd frontend-react
  pnpm install
  pnpm exec playwright install chromium
  # Si la descarga da 403 (bloqueo regional del CDN), usar el mirror:
  # PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright pnpm exec playwright install chromium
  ```

### 1. Backend (.NET) — checks

Desde la **raíz del repo**:

```bash
dotnet build backend/src/SMCA.sln
```

Debe terminar con `0 Error(s)` (los warnings NU19xx de vulnerabilidades de paquetes son preexistentes).

### 2. Backend — tests unitarios/integración, proyecto por proyecto

Los 2 proyectos de tests unitarios/integración (el tercero, E2E, va en la sección siguiente):

```bash
dotnet test backend/src/Domain.UnitTests/Domain.UnitTests.csproj
dotnet test backend/src/Application.Tests/Application.Tests.csproj
```

### 3. Backend — tests E2E

```bash
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
```

- Corre contra PostgreSQL real (`localhost:5432`, base `smca_test`): `WebAppFixture` aplica las migraciones y ejecuta `ResetDataAsync` al iniciar (borra filas de datos, preserva los seeds).
- ⚠️ **Nunca en paralelo con la suite Playwright**: el `ResetDataAsync` de `WebAppFixture` borraría las filas vivas que los tests del frontend están usando. En secuencia es seguro.

### Comando único del backend

Los 3 proyectos de tests (los 2 unitarios + el E2E) en un solo comando, verificado:

```bash
dotnet test backend/src/SMCA.sln
```

> Nota: corre también el build implícito de todos los proyectos. Si ya hiciste el build de la sección 1, agregar `--no-build` lo acelera.

### 4. Frontend React — checks

Desde **`frontend-react/`**:

```bash
pnpm typecheck   # TypeScript en todos los workspaces
pnpm lint        # ESLint con --max-warnings=0
```

### 5. Frontend React — tests (vitest)

```bash
pnpm test        # todos los workspaces vía turbo
```

### Comando único del frontend (checks + tests)

Un solo comando corre typecheck, lint y tests de todos los workspaces (turbo los ejecuta en paralelo donde puede):

```bash
pnpm turbo run typecheck lint test
```

> ⚠️ En PowerShell 5.1 **no funciona** `pnpm typecheck && pnpm lint && pnpm test` (el shell no soporta `&&`); ese es el reemplazo correcto de un comando. Si una tarea falla, turbo corta ahí y muestra qué tarea/fue — el resto ya ejecutándose termina su corrida.

### 6. Frontend React — tests E2E (Playwright)

**Paso 1 — levantar el backend para E2E** (terminal aparte, desde la **raíz del repo**):

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e
```

⚠️ **`http-e2e`, no `http`**. Ese perfil existe exactamente para esto: ya trae la connection string a `smca_test` (base de test). El perfil `http` apunta a la base de desarrollo `smca` y la suite le deja filas `e2e-*` que nadie limpia. `https` está prohibido (la redirección HTTPS usa un certificado autofirmado que el navegador rechaza). La línea de arranque `[E2E Guard] ConnectionStrings:Application -> Database=smca_test` confirma la base correcta; el backend queda en `http://localhost:5019`.

**Paso 2 — correr la suite** (desde `frontend-react/`):

```bash
pnpm test:e2e                # suite por defecto (excluye los specs de rate-limit)
pnpm test:e2e:rate-limit     # on demand: specs de rate-limit (agotan cuotas de registro/login)
pnpm test:e2e:api            # solo chequeo de conectividad con la API, sin navegador

# Un solo spec:
pnpm exec playwright test e2e/<archivo>.spec.ts

# Reporte HTML de la última corrida:
pnpm exec playwright show-report
```

Notas:

- Playwright levanta (o reutiliza) él solo el dev server en `http://localhost:3333` (`webServer` del config, `reuseExistingServer: true`). No hay que levantarlo a mano — y si hay uno corriendo de antes, ojo con su `API_URL` (el guard de arranque lo detecta).
- `login-offline.spec.ts` es el único spec que corre sin backend levantado.
- Al terminar, el `globalTeardown` borra automáticamente las filas `e2e-*` de `smca_test`. Si el log dice "0 filas borradas", el backend estaba escribiendo en otra base (p. ej. perfil `http` por error).
- Cuotas del rate limiter: 40 logins/min y 50 registros/10min por IP (`backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs`). Dos corridas completas dentro del mismo minuto pueden rozar el techo de login; dejá pasar un minuto entre corridas.

### Recorrido completo (resumen)

```bash
# ── Raíz del repo: backend completo (build + los 3 proyectos de tests) ──
dotnet test backend/src/SMCA.sln

# ── frontend-react/: checks + tests de todos los workspaces ──
pnpm turbo run typecheck lint test

# ── Terminal aparte, raíz del repo: backend para E2E del frontend ──
dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e

# ── frontend-react/ ──
pnpm test:e2e
```

El detalle paso a paso (proyecto por proyecto, tarea por tarea) está en las secciones 1–6 de arriba.