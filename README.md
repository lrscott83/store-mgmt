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

### 6. Solucionar problemas comunes

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