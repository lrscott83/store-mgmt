# 6. store-switcher-refresh — la tienda creada no aparece en el switcher

**Qué prueba el test.**
Crear una tienda en la sesión actual debe hacer que aparezca en el switcher de tiendas
del header sin necesidad de re-login.

**Qué falla.**
El botón de crear tienda nunca aparece en pantalla. El test espera 120 segundos y
muere por timeout.

**Qué necesito saber.**
- El botón de crear tienda no está visible para la persona que usa el test.
- Puede ser un problema de permisos/plan (la persona no tiene MultiStores) o un
  problema de renderizado del header.
