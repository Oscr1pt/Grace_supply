# Design — CHG-15-DASHBOARD-OPERATIONAL-CLARITY: Dashboard fiable y jerarquía profesional

## Evidencia observada en main
El dashboard muestra todas las ventas como ingresos totales y gastos solo del mes; inventario se valora con precio de venta sin describirlo y el contador de clientes incluye inactivos bajo la etiqueta 'registros activos'. La UI no distingue claramente carga/error de cero datos.

## Archivos y áreas de trabajo
- `src/routes/_app/dashboard.tsx`
- `src/components/PageHeader.tsx`
- `src/lib/storage.ts`
- `src/lib/settings.ts`
- `tests/browser/**`

## Diseño propuesto
- Revisar nombres, alcances temporales, exclusión de anulados y permiso de las métricas existentes.
- Mejorar jerarquía de KPIs, transacciones recientes, estados iniciales y acciones rápidas con los tokens actuales.
- Eliminar acciones que insinúen que una venta está operativa cuando la política tributaria sigue sin aprobarse.

## Restricciones y decisiones
- No inventar indicadores financieros ni derivar ganancias sin costo/contabilidad acordados.
- Distinguir claramente valor estimado a precio de venta de valuación al costo y documentar qué representa cada métrica.
- Usar calendario de negocio español/RD, no extrapolar el mes con UTC cuando altera la fecha local.
- No mostrar ceros engañosos cuando una consulta falla o sigue cargando; respetar mínimo privilegio.

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-15-dashboard-operational-clarity --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
