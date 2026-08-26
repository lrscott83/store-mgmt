# S5-A1 — Hard Delete Owner con Confirmación

**Módulo:** Admin > Propietarios
**Tipo:** Feature + UI
**Prioridad:** Alta
**Autor:** Codebuff
**Fecha:** 2026-08-26

---

## 1. Contexto

Actualmente, el botón "Eliminar" en el gear menu de un owner ejecuta la eliminación **sin confirmación**. El backend ya realiza hard delete (elimina User, Store, StoreUsers, StoreModules, UserRole, StoreRoleFeature, ReSellerOwner, etc.). Se necesita:

1. Agregar un **popup de confirmación** antes de ejecutar la eliminación
2. Mantener el gear en la posición correcta (header del card, no debajo)
3. Mostrar un mensaje claro de las consecuencias (tienda, usuarios, datos serán eliminados permanentemente)

## 2. Requisitos

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| R1 | La opción "Eliminar permanentemente" aparece en el gear menu del card | Alta |
| R2 | Al hacer clic, se muestra un popup de confirmación | Alta |
| R3 | El popup muestra el nombre del owner y las consecuencias | Alta |
| R4 | Confirmar ejecuta DELETE /v1/owners/{id} (hard delete) | Alta |
| R5 | Cancelar cierra el popup sin acción | Alta |
| R6 | Después de eliminar, la lista se actualiza automáticamente | Alta |
| R7 | El gear permanece en el header del card (posición actual) | Media |
| R8 | Errores se muestran inline en la página | Media |

## 3. Diseño

### 3.1 Backend
- **Endpoint existente:** `DELETE /v1/owners/{id}` (hard delete, ya implementado)
- **No se requieren cambios en el backend**

### 3.2 Frontend

#### Componente: AlertDialog (nuevo)
- Modal de confirmación reutilizable
- Props: `open`, `onClose`, `onConfirm`, `title`, `description`, `confirmLabel`, `confirmIntent`
- Estilo consistente con el design system existente

#### OwnerCardList
- Agregar opción "Eliminar permanentemente" con `intent="delete"`
- Agregar estado `ownerToDelete` para controlar el modal
- El modal muestra: nombre del owner, advertencia de eliminación irreversible

#### OwnerListPage
- Agregar función `handleDeleteConfirm` que ejecuta la eliminación
- Estado `showDeleteConfirm` y `ownerToDelete`

### 3.3 Flujo
1. Usuario hace clic en gear → "Eliminar permanentemente"
2. Se abre modal: "¿Eliminar permanentemente a {nombre}?"
3. Descripción: "Se eliminarán: la tienda, todos los usuarios asociados y todos los datos. Esta acción no se puede deshacer."
4. Botones: "Cancelar" (outline) y "Eliminar" (rojo/danger)
5. Clic "Eliminar" → DELETE /v1/owners/{id}
6. Cerrar modal, recargar lista
7. Si hay error, mostrar inline

### 3.4 i18n
```typescript
'OWNER.DELETE_CONFIRM_TITLE': 'Eliminar propietario permanentemente'
'OWNER.DELETE_CONFIRM_MESSAGE': '¿Está seguro que desea eliminar permanentemente a {name}?'
'OWNER.DELETE_CONFIRM_WARNING': 'Se eliminarán la tienda, todos los usuarios asociados y todos los datos. Esta acción no se puede deshacer.'
'OWNER.DELETE_CONFIRM_BUTTON': 'Eliminar permanentemente'
'OWNER.DELETE_SUCCESS': 'El propietario fue eliminado correctamente.'
```

## 4. Tests

### 4.1 Unit Tests (Vitest)
- AlertDialog se renderiza con título y mensaje
- AlertDialog llama a onConfirm al confirmar
- AlertDialog llama a onClose al cancelar
- OwnerListPage muestra modal al clickear "Eliminar permanentemente"
- OwnerListPage ejecuta deleteOwner al confirmar
- OwnerListPage cierra modal al cancelar
- OwnerListPage actualiza lista tras eliminar

### 4.2 E2E Tests (Playwright)
- Gear menu muestra "Eliminar permanentemente"
- Clic "Eliminar permanentemente" abre modal de confirmación
- Modal muestra nombre del owner
- Confirmar elimina el owner y actualiza la lista
- Cancelar cierra sin eliminar

## 5. Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `frontend-react/apps/web-store-pos/app/shared/components/ui/confirm-dialog.tsx` | **Crear** |
| `frontend-react/apps/web-store-pos/app/admin/owners/components/owner-card-list.tsx` | Modificar |
| `frontend-react/apps/web-store-pos/app/admin/owners/routes/owner-list.tsx` | Modificar |
| `frontend-react/apps/web-store-pos/app/admin/owners/routes/__tests__/owner-list.test.tsx` | Modificar |
| `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modificar |

## 6. Verificación
1. Vitest: todos los tests pasan
2. Playwright: tests E2E pasan (con backend corriendo en :5019)
3. Typecheck: sin errores en frontend
