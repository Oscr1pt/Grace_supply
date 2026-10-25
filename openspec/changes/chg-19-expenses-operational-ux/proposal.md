# CHG-19-EXPENSES-OPERATIONAL-UX — Registro y consulta de gastos operativos

## Why
El módulo de gastos contiene filtros, tarjetas y detalles extensos; fechas 'hoy/mes' basadas en UTC, etiquetas con colores de contraste dudoso sobre tema claro, y motivos de anulación mediante prompt nativo. Se necesita una experiencia robusta sin alterar el libro financiero.

## What Changes
- Refinar formulario de gasto, categorías, dinero, fecha local, métodos, beneficiarios y comprobantes.
- Aclarar filtros, resúmenes, estados registrados/anulados, detalles y listados móviles.
- Mejorar anulación con motivo, pendiente, errores y permisos sin manipular directamente registros auditados.

## Capabilities
### New Capabilities
- `expenses-workflow-ux`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/expenses.tsx`
- `src/components/PageHeader.tsx`
- `src/lib/storage.ts`
- `tests/browser/**`

## Boundaries
- No alterar la evidencia financiera ni borrar originales; la anulación sigue por función autorizada.
- El resultado final de gasto confirmado viene de PostgreSQL, no de cálculo cliente.
- Corregir uso UTC en fechas de calendario local de RD cuando provoca periodos erróneos.
- Respetar colores de tema y contraste en labels, no usar text-neutral-300 sobre fondos blancos.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
