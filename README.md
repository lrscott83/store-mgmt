# store-mgmt

## VPS — Comandos de administración

### 1. Backup de la base de datos

```bash
# Backup completo (SQL plano)
docker exec smca.database pg_dump -U postgres smca > ~/smca_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup comprimido
docker exec smca.database pg_dump -U postgres smca | gzip > ~/smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restaurar desde backup
docker exec -i smca.database psql -U postgres -d smca < ~/smca_backup_YYYYMMDD_HHMMSS.sql
```

### 2. Cambiar password del usuario admin

**Desde la app web (recomendado):**
1. Logueate como admin
2. Ve a `/profile/change-password`
3. Cambia la contraseña

**Desde la BD directamente:**
```bash
docker exec -it smca.database psql -U postgres -d smca -c "UPDATE \"User\" SET \"Password\" = 'HASH_ARGON2ID' WHERE login = 'admin';"
```

### 3. Conexión a la BD (referencia)

| Campo | Valor |
|---|---|
| Container | `smca.database` |
| DB | `smca` |
| User | `postgres` |
| Password | `postgres` |
| Port | `5432` |

```bash
# Conectar desde el host
psql -h localhost -p 5432 -U postgres -d smca

# Conectar desde Docker
docker exec -it smca.database psql -U postgres -d smca
```