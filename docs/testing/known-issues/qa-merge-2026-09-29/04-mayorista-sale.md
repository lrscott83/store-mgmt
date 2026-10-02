# 4. mayorista-sale — la opción Transferencia (CUP) no aparece

**Qué prueba el test.**
En una venta mayorista, el método de pago Transferencia (CUP) debe aparecer como opción
de filtro y la venta debe quedar registrada con ese método.

**Qué falla.**
El radio de Transferencia (CUP) nunca se renderiza en la pantalla. El test espera 120
segundos y muere por timeout.

**Qué necesito saber.**
- La opción de pago no está disponible para la persona que usa el test.
- Puede ser un problema de plan/módulo (la persona no tiene acceso a Transferencia)
  o un problema de renderizado del filtro.
