# API Endpoints — OwnerAdmin + StoreUser

> Priorizado por criticidad. Todos los endpoints que necesita el frontend para los roles **OwnerAdmin** y **StoreUser**.
> StoreUser tiene acceso solo a los grupos AUTH y PROFILE. OwnerAdmin tiene acceso a todo.

---

## Prioridad 1 — AUTH (OwnerAdmin + StoreUser)

Indispensable. Sin esto nadie entra al sistema.

POST   /api/v1/auth/login
GET    /api/v1/auth/logout
GET    /api/v1/auth/me
GET    /api/v1/auth/google-auth-url
POST   /api/v1/auth/get-social-token
POST   /api/v1/forgot-password

---

## Prioridad 2 — USAGE TRACKER (OwnerAdmin + StoreUser)

Se ejecuta automáticamente en cada navegación. Si falla, no bloquea pero pierde tracking.

POST   /api/v1/usages/store-daily-usage

---

## Prioridad 3 — PROFILE (OwnerAdmin + StoreUser)

Edición de perfil y cambio de password del usuario autenticado.

PUT    /api/v1/users/{id}
POST   /api/v1/users/change-password/{id}

---

## Prioridad 4 — STORES (solo OwnerAdmin)

CRUD de tiendas. El OwnerAdmin gestiona su(s) tienda(s).

GET    /api/v1/stores/by-current-user
GET    /api/v1/stores/{id}
POST   /api/v1/stores
PUT    /api/v1/stores/{id}
POST   /api/v1/stores/activate
DELETE /api/v1/stores/{id}

---

## Prioridad 5 — STORE USERS (solo OwnerAdmin)

CRUD de empleados (StoreUser) de la tienda.

GET    /api/v1/storeusers/list/{includeInactive}
GET    /api/v1/storeusers/{id}
POST   /api/v1/storeusers
PUT    /api/v1/storeusers/{id}
DELETE /api/v1/storeusers{id}

---

## Prioridad 6 — USERS (solo OwnerAdmin)

CRUD de usuarios del store (OwnerAdmin gestiona owners y usuarios).

GET    /api/v1/users/all/{includeInactive}
GET    /api/v1/users/{id}
POST   /api/v1/users
PUT    /api/v1/users/{id}
POST   /api/v1/users/activate
DELETE /api/v1/users/{id}

---

## Prioridad 7 — MODULES (solo OwnerAdmin)

Obtener módulos disponibles para asignar a una tienda.

GET    /api/v1/modules/ToStore

---

## Prioridad 8 — OWNERS (solo OwnerAdmin con feature Owners)

CRUD de owners. Se usa desde el formulario de crear/editar tienda cuando el OwnerAdmin tiene la feature Owners asignada.

GET    /api/v1/owners/all/false
GET    /api/v1/owners/{id}
POST   /api/v1/owners
PUT    /api/v1/owners/{id}
DELETE /api/v1/owners/{id}

---

## Resumen

| Grupo | Prioridad | OwnerAdmin | StoreUser |
|-------|-----------|:----------:|:---------:|
| AUTH | 1 | ✅ | ✅ |
| USAGE TRACKER | 2 | ✅ | ✅ |
| PROFILE | 3 | ✅ | ✅ |
| STORES | 4 | ✅ | ❌ |
| STORE USERS | 5 | ✅ | ❌ |
| USERS | 6 | ✅ | ❌ |
| MODULES | 7 | ✅ | ❌ |
| OWNERS | 8 | ✅ (con feature) | ❌ |

**Total: 33 endpoints** (7 compartidos, 26 solo OwnerAdmin).
