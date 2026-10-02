# 3. web-catalog — el producto no aparece en el catálogo público

**Qué prueba el test.**
Crear un producto en el POS, sincronizar el catálogo web, editarlo y verificar que
aparece publicado en la página pública de la tienda.

**Qué falla.**
Después de pulsar "Sincronizar Catálogo", el producto no aparece en la lista del
catálogo web. El test espera el nombre del producto y nunca llega.

**Qué necesito saber.**
- El flujo de sincronización no está publicando el producto.
- Puede ser que la sincronización falle silenciosamente o que el producto no cumpla
  alguna condición nueva para publicarse.
