# Tasks

Planificación: tres tareas del roadmap, pendientes; esta lista no autoriza implementación.

## 1. Contrato de persistencia

- [ ] 1.1 Definir e implementar el contrato confirmado/error/incierto de escrituras Supabase con inspección de errores e IDs/filas afectadas; verificarlo con pruebas de respuesta con error, excepción, cero filas y una fila confirmada y documentar sus estados.

## 2. Consumidores y confirmaciones

- [ ] 2.1 Corregir fallback y confirmaciones anticipadas en storage, ajustes/etiquetas, ventas/compras/créditos/pagos/gastos/catálogos y empleados; verificar en cada flujo que espere, conserve entrada al fallar y actualice estado/caché solo al confirmar, documentando fallos parciales sin atribuirles atomicidad.

## 3. Verificación integrada

- [ ] 3.1 Probar en staging sintético RLS denegada, fallo SQL, desconexión, timeout posterior al envío y respuestas fuera de orden; verificar ausencia de éxito, cierre, impresión o repetición ciega y contrastar cada confirmación con persistencia autorizada.

