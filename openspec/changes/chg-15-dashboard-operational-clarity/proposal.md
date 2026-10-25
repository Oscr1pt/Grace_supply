# CHG-15-DASHBOARD-OPERATIONAL-CLARITY — Dashboard fiable y jerarquía profesional

## Why
El dashboard muestra todas las ventas como ingresos totales y gastos solo del mes; inventario se valora con precio de venta sin describirlo y el contador de clientes incluye inactivos bajo la etiqueta 'registros activos'. La UI no distingue claramente carga/error de cero datos.

## What Changes
- Revisar nombres, alcances temporales, exclusión de anulados y permiso de las métricas existentes.
- Mejorar jerarquía de KPIs, transacciones recientes, estados iniciales y acciones rápidas con los tokens actuales.
- Eliminar acciones que insinúen que una venta está operativa cuando la política tributaria sigue sin aprobarse.

## Capabilities
### New Capabilities
- `trustworthy-dashboard-insights`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/dashboard.tsx`
- `src/components/PageHeader.tsx`
- `src/lib/storage.ts`
- `src/lib/settings.ts`
- `tests/browser/**`

## Boundaries
- No inventar indicadores financieros ni derivar ganancias sin costo/contabilidad acordados.
- Distinguir claramente valor estimado a precio de venta de valuación al costo y documentar qué representa cada métrica.
- Usar calendario de negocio español/RD, no extrapolar el mes con UTC cuando altera la fecha local.
- No mostrar ceros engañosos cuando una consulta falla o sigue cargando; respetar mínimo privilegio.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
