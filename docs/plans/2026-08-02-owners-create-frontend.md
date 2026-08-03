# Owners Create Endpoint Fixes — Frontend Impact

**Date**: 2026-08-02
**Backend change**: `owners-create-endpoint-fixes`

## ⚠️ Breaking Changes (4)

### 1. POST /api/v1/Owners — 200 → 201 Created

| Aspect | Before | After |
|--------|--------|-------|
| Status Code | HTTP **200** OK | HTTP **201** Created |
| Location header | None | `/api/v1/owners/{id}` |

### 2. Response body: bool → OwnerDto

| Aspect | Before | After |
|--------|--------|-------|
| Type | `ResponseResult<bool>` | `ResponseResult<OwnerDto>` |
| `data` | `true`/`false` | Full OwnerDto object |
| `data.id` | No disponible | GUID del owner creado |
| `data.fullName` | No disponible | Nombre completo |
| `data.login` | No disponible | Login |
| `data.email` | No disponible | Email |
| `data.reSellerId` | No disponible | GUID del reseller (si aplica) |
| `data.reSellerName` | No disponible | Nombre del reseller |

### 3. Duplicate login: 400 → 409

| Aspect | Before | After |
|--------|--------|-------|
| Status Code | HTTP **400** Bad Request | HTTP **409** Conflict |
| Error `actionCode` | Error de validación genérico | **409** |
| Error `code` | `"Login"` (FluentValidation) | `"Owner.DuplicateLogin"` |

### 4. Auth rejection: 400 → 403

| Aspect | Before | After |
|--------|--------|-------|
| Status Code | HTTP **400** "UserNotFound" | HTTP **403** Forbidden |
| Message | "Usuario no encontrado" (incorrecto) | "Unauthorized" |

## OwnerDto Shape (POST Response)

```json
{
  "succeeded": true,
  "actionCode": 201,
  "data": {
    "id": "guid",
    "login": "string",
    "fullName": "string",
    "email": "string",
    "cellphone": "string",
    "isActive": true,
    "reSellerId": "guid | null",
    "reSellerName": "string | null",
    "approved": true,
    "storeModules": [],
    "stores": []
  }
}
```

## Non-Breaking Improvements

| # | Fix | Impacto |
|---|-----|---------|
| 5 | Password complexity (min 8 + uppercase) | Nuevas reglas de validación — passwords débiles ahora rechazadas con 400 |
| 6 | ReSeller null guard | Antes: 500 NRE. Ahora: 400 "ReSellerNotFound" |
| 7 | [ProducesResponseType] completo | Swagger ahora documenta todos los códigos de error |
| 8 | XML docs: "Create a new owner" | Solo documentación |

## Acción Requerida en Frontend

1. **Manejar 201 Created**: Actualizar interceptors/clients para tratar 201 como success (no solo 200)
2. **Parsear OwnerDto**: Cambiar `response.data` de `boolean` a objeto con `id`, `fullName`, `login`, `email`, etc.
3. **Manejar 409 Conflict**: Agregar manejo para `actionCode === 409` con código `"Owner.DuplicateLogin"` (antes era 400 genérico)
4. **Manejar 403 Forbidden**: Si el frontend tenía lógica específica para "UserNotFound" en 400 de este endpoint, actualizar a 403
5. **Leer Location header**: Usar el header `Location` para obtener la URL del recurso creado (opcional, el ID ya viene en el body)
