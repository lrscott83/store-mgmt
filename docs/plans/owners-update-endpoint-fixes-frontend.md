# Frontend Contract Changes — PUT /api/v1/Owners/{id}

**Date**: 2026-08-02  
**Source Change**: `owners-update-endpoint-fixes` (SDD)  
**Target**: Frontend (Angular / React)  
**Severity**: BREAKING — requiere actualización del cliente

---

## Breaking Changes

### 1. Response body: `bool` → `OwnerDto`

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Tipo de `data` | `boolean` | `OwnerDto` (objeto) |
| Status 200 | `{ succeeded: true, data: true, errors: null }` | `{ succeeded: true, data: { id, userId, login, fullName, cellPhone, email, ... }, errors: null }` |

**`OwnerDto` shape (response 200)**:
```json
{
  "succeeded": true,
  "data": {
    "id": "guid",
    "userId": "guid",
    "login": "string",
    "fullName": "string",
    "cellPhone": "string",
    "email": "string | null",
    "description": "string | null",
    "guest": "boolean",
    "storeModules": [],
    "reSellerId": "guid | null",
    "reSellerName": "string | null",
    "approved": "boolean",
    "isActive": "boolean"
  },
  "errors": null
}
```

> ⚠️ `storeModules` siempre es `[]` en el response de PUT (el endpoint no carga los módulos en este path). Si el frontend necesita los módulos después de un update, debe hacer un GET adicional.

### 2. Status code: `400` → `404` para owner inexistente

| Escenario | Antes | Ahora |
|-----------|-------|-------|
| Owner ID no existe | `400 BadRequest` + `errors[0].code: "Id"` | `404 NotFound` |

**Error response (404)**:
```json
{
  "succeeded": false,
  "data": null,
  "errors": [{ "code": "OwnerNotFound", "message": "Owner not found" }]
}
```

### 3. Status code: `400` → `403` para OwnerAdmin sin permiso real

| Escenario | Antes | Ahora |
|-----------|-------|-------|
| Usuario con rol OwnerAdmin intenta update | `400 BadRequest` + `"OwnerNotFound"` (engañoso) | `403 Forbidden` |

> Este escenario **nunca funcionó** en producción — el handler rechazaba al OwnerAdmin con un error 400 engañoso. Ahora el filtro de autorización retorna 403 correctamente. Si algún flujo frontend dependía de que este endpoint funcionara para OwnerAdmins, **ese flujo ya estaba roto** y debe rediseñarse.

---

## Cambios No-Breaking (documentados)

### Nuevos status codes documentados en OpenAPI

| Status | Significado | ¿Nuevo? |
|--------|-------------|---------|
| `200` | Update exitoso, `data` = `OwnerDto` | Modificado (era `bool`) |
| `400` | Error de validación (campos inválidos) | Ya existía, ahora documentado |
| `401` | No autenticado | Nuevo en spec |
| `403` | No autorizado (rol sin permiso) | Nuevo en spec |
| `404` | Owner no encontrado | Cambió de 400 |
| `500` | Error interno | Nuevo en spec |

### Validaciones que siguen igual

| Campo | Regla | Error |
|-------|-------|-------|
| `FullName` | Requerido, no vacío | `400` + `Code: "FullName"` |
| `CellPhone` | Requerido, no vacío | `400` + `Code: "CellPhone"` |
| `Email` | Si se envía, debe ser formato válido | `400` + `Code: "Email"` |
| `ReSellerId` | Si se envía, el ReSeller debe existir | `400` + `Code: "ReSellerId"` |

### Request body — sin cambios

```json
{
  "reSellerId": "guid | null",
  "fullName": "string",
  "cellPhone": "string",
  "email": "string | null",
  "description": "string",
  "guest": "boolean",
  "isActive": "boolean"
}
```

---

## Acciones Requeridas (Frontend)

### 1. Actualizar el tipo de respuesta del PUT

```typescript
// Antes
const response = await api.put<ResponseResult<boolean>>(`/api/v1/Owners/${id}`, body);

// Ahora
const response = await api.put<ResponseResult<OwnerDto>>(`/api/v1/Owners/${id}`, body);
```

### 2. Manejar 404 en vez de 400 para "no encontrado"

```typescript
// Antes
if (response.status === 400 && error.code === 'Id') { /* not found */ }

// Ahora
if (response.status === 404) { /* not found */ }
```

### 3. Usar el OwnerDto devuelto en vez de hacer GET extra

```typescript
// Antes — se necesitaba un GET después del PUT para obtener los datos actualizados
await updateOwner(id, body);
const owner = await getOwner(id);

// Ahora — el PUT ya devuelve el OwnerDto actualizado
const result = await updateOwner(id, body);
const owner = result.data; // OwnerDto fresco
```

### 4. Validar flujo OwnerAdmin

Si el frontend tenía un flujo donde un usuario con rol `OwnerAdmin` actualizaba owners, verificar que:
- El flujo **nunca funcionó** en backend (retornaba 400 engañoso)
- Ahora retorna `403 Forbidden` correctamente
- Si el flujo debe existir, se necesita un cambio de backend para agregar `OwnerAdmin` a `StoreRoleFeatures.OwnersAdmin`

---

## Rollback

Revertir el cambio `owners-update-endpoint-fixes`. Sin migraciones de DB. El endpoint anterior ya estaba roto (User.FullName/CellPhone/Email no se persistían), por lo que revertir restaura el comportamiento roto anterior.
