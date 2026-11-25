# Design

## Context

Ver proposal.md para la motivación y las especificaciones de comportamiento. El proyecto ya define permisos de ruta, políticas RLS, formatos monetarios DOP, el huso America/Santo_Domingo, estados de lectura y Recharts. Las tablas financieras tienen permisos distintos; las ventas conservan subtotal e ITBIS, los gastos tienen fecha/categoría/estado, las compras conservan sus importes y las líneas vendidas no guardan costo histórico. La especificación financial-evidence-preservation distingue auditoría detallada de resúmenes gerenciales agregados.

## Goals / Non-Goals

**Goals:**

- Mantener acceso administrativo incluso al invocar directamente la API.
- Devolver agregados y buckets acotados por período, sin descargar transacciones al navegador.
- Usar una única respuesta de consulta para tarjetas, gráficos, resumen textual e impresión.
- Evitar doble conteo y semánticas de utilidad no sustentadas por el esquema.

**Non-Goals:**

- Cambiar permisos de empleados, operaciones de negocio, tablas financieras o políticas fiscales.
- Calcular utilidad, conciliación de cobros o detalle de documentos anulados.
- Generar PDF en servidor o introducir una biblioteca cliente de PDF.

## Decisions

1. **Una RPC agregada de solo lectura.** Crear una función Postgres dedicada que reciba granularidad y fecha ancla y devuelva indicadores, buckets del gráfico principal y totales por categoría en una estructura limitada. La función valida explícitamente usuario autenticado, activo y administrador antes de consultar. Revocar EXECUTE de PUBLIC y anon, y concederlo solo a authenticated. Preferir SECURITY INVOKER con objetos cualificados y RLS vigente; solo usar SECURITY DEFINER si pruebas demuestran que las políticas no permiten leer agregados para administradores. En ese caso, restringir el propietario, validar admin antes de consultar, fijar search_path seguro, cualificar objetos y limitar grants/salida.

   Alternativas consideradas: consultas separadas desde el navegador, que duplican reglas, exponen más filas y dependen de permisos por tabla; una vista agregada persistente, innecesaria para este volumen y período.

2. **Período definido desde una fecha ancla.** La RPC recibe uno de week/month/year y una fecha civil; valida los valores, deriva el intervalo completo de calendario y opera con intervalo semiabierto. Para timestamps, convierte medianoches locales de Santo Domingo a instantes; para columnas date usa límites civiles equivalentes. Semanas comienzan lunes. Los buckets se derivan de los límites del mismo período y reportan fechas/etiquetas de forma estable.

3. **Semántica contable acotada.** Sumar sales.subtotal como ventas sin ITBIS y sales.tax como ITBIS informativo; no sumar sales.total como ingreso ni pagos/abonos como ventas. Sumar gastos con estado registrado y excluir anulados. Sumar compras no anuladas por separado. No consultar credit_payments, créditos ni compensaciones para indicadores del MVP. No usar costo actual de inventario para calcular utilidad.

   Alternativas consideradas: flujo de caja por cobros, que exige conciliación y reversos; utilidad, que necesita costo histórico por línea y método de costeo; ambas quedan fuera.

4. **Anulación y auditoría.** El resumen agregado excluye documentos anulados a la fecha de consulta y no expone importes de compensaciones como transacciones independientes. La vista detallada de auditoría conserva el requisito existente de mostrar original, estado y compensación enlazada. Por ello, una anulación posterior puede cambiar retrospectivamente el total mostrado para el período original; el módulo lo documenta como resumen de registros vigentes, no como libro histórico de eventos.

5. **Interfaz y permisos.** Añadir la ruta /reports con guard de administrador, y mostrar el enlace lateral solo a admins. Esto es usabilidad, no seguridad: la RPC aplica el control efectivo en base. Reutilizar componentes, formatos y estados de lectura existentes, y mostrar acceso denegado aunque la ruta se abra manualmente.

6. **Misma respuesta para pantalla e impresión.** Mantener un modelo tipado de resultado recibido desde la RPC; tarjetas, gráfico, resumen y vista imprimible consumen ese mismo modelo sin recalcular totales en el cliente. Recharts se conserva para las dos visualizaciones; impresión usa window.print() y CSS @media print para ocultar navegación/controles y evitar cortes. No añadir dependencia PDF.

7. **Rendimiento de períodos anuales.** La RPC filtra en base por límites antes de agrupar y retorna a lo sumo 12 buckets anuales, 5-6 buckets semanales/mensuales y el número acotado de categorías existentes. Evaluar plan de consulta e índices de fechas durante implementación; si el plan revela escaneo costoso, proponer índices compatibles con RLS en una migración separada dentro de esta misma Change.

## Risks / Trade-offs

- [Los permisos RLS de negocio pueden hacer que SECURITY INVOKER no lea todos los datos aun para admin] → Probar admin, empleado y anónimo contra la RPC; conservar invoker si funciona y usar definer restringido solo con justificación comprobada.
- [Una anulación posterior altera retrospectivamente el resumen del período] → Etiquetar el reporte como agregado de documentos vigentes y no como auditoría; mantener compensaciones enlazadas en la consulta de auditoría existente.
- [Registros históricos incompletos o campos numéricos nulos] → No inferir clasificación ni datos faltantes; definir explícitamente tratamiento de NULL y probarlo con fixtures.
- [Barras o etiquetas largas son difíciles en móvil e impresión] → Usar barras horizontales para categorías, etiquetas abreviadas accesibles y reglas de impresión probadas en anchos pequeños.
- [Zona horaria mal aplicada en fechas date y timestamptz] → Probar medianoche local, cambio de año, semana que cruza mes/año y límites semiabiertos con datos de frontera.

## Migration Plan

1. Añadir la RPC de lectura y sus grants mínimos; no se alteran filas ni se aplica backfill.
2. Verificar la migración localmente con pruebas de rol, RLS, límites, agregados y ausencia de escritura.
3. Publicar migración y frontend según el pipeline aprobado del proyecto; desplegar solo después de validar los guards y la autorización.
4. Rollback: retirar la entrada/ruta frontend y revocar o eliminar la RPC en una migración forward-only si deja de ser necesaria. La función no escribe datos, por lo que no requiere restaurar datos financieros.

## Open Questions

Ninguna. El propietario confirmó que el MVP es solo para administradores y que excluye detalle de auditoría de anulaciones.
