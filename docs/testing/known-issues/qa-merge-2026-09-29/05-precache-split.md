# 5. precache-split — el service worker no se activa (2 tests)

**Qué prueban los tests.**
1. Los chunks de rutas Owner/StoreUser están precacheados (la app los descarga
   para funcionar offline).
2. Las librerías pesadas (PDF, scanner, gráficos) están precacheadas.

**Qué fallan.**
El service worker nunca llega al estado "activated". Los tests esperan 30 segundos
y mueren por timeout.

**Qué necesito saber.**
- El service worker no se registra o no se activa en el entorno de tests.
- Ambos tests comparten la misma causa: si el service worker no se activa, ninguno
  puede verificar el precache.
- Puede ser un problema del build (el service worker no se genera) o del entorno
  de tests (el navegador headless no soporta service workers).
