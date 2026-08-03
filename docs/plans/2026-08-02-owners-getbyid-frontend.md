# Owners GetById Endpoint Fixes — Frontend Impact

**Date**: 2026-08-02
**Backend change**: `owners-getbyid-endpoint-fixes`

## ⚠️ Breaking Change

### GET /api/v1/Owners/{id} — owner no encontrado

| Aspect | Before | After |
|--------|--------|-------|
| Status Code | HTTP **400** Bad Request | HTTP **200** OK (envelope-based) |
| Response body | `ValidationException` errors | `{ succeeded: false, actionCode: 404, errors: [{ code: "Owner.NotFound" }] }` |
| Error code | `"OwnerId"` (FluentValidation property error) | `"Owner.NotFound"` (domain error) |

**Qué cambió**: Cuando se consulta un owner que no existe (ID inválido o borrado), el backend ya NO devuelve HTTP 400 con errores de validación. Ahora devuelve HTTP 200 con un envelope `succeeded: false` y `actionCode: 404`.

**Acción requerida en frontend**: Si el código actualmente maneja `HttpStatusCode.BadRequest` (400) para este endpoint y parsea errores de FluentValidation, debe actualizarse para:
1. Verificar `response.succeeded === false` y `response.actionCode === 404` en la respuesta (HTTP 200)
2. Buscar el código de error `"Owner.NotFound"` en `response.errors`

## Contract (Actualizado)

### GET /api/v1/Owners/{id}

| Aspect | Value |
|--------|-------|
| Route | `/api/v1/Owners/{id}` |
| Method | GET |
| Authorization | `OwnersAdmin` |
| Response (200 OK) | `ResponseResult<OwnerDto>` con owner encontrado |
| Response (200 - envelope 404) | `ResponseResult<OwnerDto>` con `succeeded: false`, `actionCode: 404`, error `"Owner.NotFound"` |
| Response (200 - envelope 400) | `ResponseResult<OwnerDto>` con `succeeded: false`, `actionCode: 400`, error `"OwnerId"` (Guid.Empty) |
| Response (401) | No autenticado (documentado en Swagger) |
| Response (403) | Sin permiso `OwnersAdmin` (documentado en Swagger) |
| Response (500) | Error interno (documentado en Swagger) |

### OwnerDto shape (sin cambios)

```json
{
  "succeeded": true,
  "data": {
    "id": "guid",
    "login": "string",
    "fullName": "string",
    "email": "string",
    "cellphone": "string",
    "isActive": true,
    "reSellerId": "guid",
    "reSellerName": "string",
    "approved": true,
    "storeModules": [...]
  }
}
```

## Fixes Transparentes al Frontend

| # | Fix | Impacto |
|---|-----|---------|
| 1 | Includes completos en repositorio (Stores, StoreModules, ReSeller.User) | `reSellerName` y `storeModules` ahora siempre llegan poblados (antes podían ser null/vacío) |
| 2 | CancellationToken propagation | Requests cancelados correctamente |
| 3 | `[ProducesResponseType]` actualizado | Swagger docs ahora muestran todos los códigos de error |
| 4 | XML doc: "Get owner by id" | Solo documentación |

## Resumen

- **1 breaking change**: 400 → envelope 404 para owner no encontrado
- **1 mejora de datos**: `reSellerName` y `storeModules` ahora siempre poblados (antes N+1 o null)
- **Sin cambios en**: ruta, método HTTP, shape del DTO, autenticación
