# Testing — etapas

Índice de las etapas de cobertura E2E del producto. Cada etapa vive en su propia carpeta, con un plan general y un fichero por User Story.

## Regla del proyecto (innegociable)

`CLAUDE.md`: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

Agregar tests nuevos está permitido. Tocar los existentes requiere autorización explícita del usuario, siempre. Un test E2E en rojo es información, no un obstáculo.

## Las dos capas de cobertura

Toda etapa declara el estado de las dos, por separado, para cada User Story:

| Capa | Qué prueba | Dónde vive |
|---|---|---|
| **E2E frontend (Playwright)** | Lo que el usuario ve y puede hacer: redirecciones, render, estado visible, mensajes literales, tráfico de red observado | `frontend-react/e2e/` |
| **E2E backend (.NET)** | La verdad del dato: campos persistidos, fechas, relaciones, códigos HTTP, estado de plan computado | `backend/src/SMCA.WebApi.E2ETests/` |

Ninguna de las dos prueba el comportamiento offline puro sobre `localStorage`.

## Etapas

| Etapa | Alcance | Escenarios | Estado | Plan |
|---|---|---|---|---|
| **Etapa 1** | Las operaciones que efectivamente cruzan la frontera hacia la API: sesión y acceso, ciclo de vida de tienda y plan, gestión de usuarios, perfil propio | 12 US + 1 invariante | En curso — 1 US con cobertura Playwright | [e2e-stage-1/](e2e-stage-1/README.md) |

No hay más etapas definidas todavía. Las siguientes se agregan como filas de esta tabla, con su propia carpeta hermana.
