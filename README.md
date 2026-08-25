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
podman exec -it smca_postgres_db psql -U postgres -d smca -c "UPDATE \"User\" SET \"Password\" = 'HASH_ARGON2ID' WHERE \"Login\" = 'admin';"
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
podman logs -f --tail 100 smca_api

# Logs solo de errores
podman logs smca_api 2>&1 | grep -i "error\|exception\|fail"

# Logs de una fecha específica
podman logs smca_api 2>&1 | grep "2026-08-25"

# Logs de autenticación (útiles para debuggear login 400)
podman logs smca_api 2>&1 | grep -i "auth\|login\|token"

# Últimas 50 líneas con timestamps
podman logs --tail 50 smca_api 2>&1 | tail -50
```

**Nota:** El nombre del contenedor del backend puede variar. Verifica con:
```bash
podman ps --format "{{.Names}}" | grep -i api
```

### 6. Conexión a la BD (referencia)

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