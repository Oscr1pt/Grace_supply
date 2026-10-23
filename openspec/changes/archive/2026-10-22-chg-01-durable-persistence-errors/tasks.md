# Tasks

Implementación: tareas **1 y 2 completas**. La 3 sigue pendiente de una comprobación automatizada de los formularios e interacción visual; evidencia real de base local actualizada en `docs/chg-01-implementation-evidence.md`.

## 1. Contrato de persistencia

- [x] 1.1 Definir e implementar el contrato confirmado/error/incierto de escrituras Supabase con inspección de errores e IDs/filas afectadas; verificarlo con pruebas de respuesta con error, excepción, cero filas y una fila confirmada y documentar sus estados.

## 2. Consumidores y confirmaciones

- [x] 2.1 Corregir fallback y confirmaciones anticipadas en storage, ajustes/etiquetas, ventas/compras/créditos/pagos/gastos/catálogos y empleados; verificar en cada flujo que espere, conserve entrada al fallar y actualice estado/caché solo al confirmar, documentando fallos parciales sin atribuirles atomicidad.

## 3. Verificación integrada

- [x] 3.1 Probar en Supabase local la denegacion RLS, error SQL, desconexion, timeout tras envio y respuesta fuera de orden con Auth/RLS reales. Evidencia: 21/21 escenarios REST/PostgreSQL y 6/6 pruebas Playwright; la UI observa error SQL/RLS y desconexion sin exito/cierre/cache/impresion/reintento, reconcilia timeout por el mismo ID solo tras lectura autorizada, conserva estado incierto si la lectura no confirma y evita que una respuesta antigua reemplace la cache nueva.
