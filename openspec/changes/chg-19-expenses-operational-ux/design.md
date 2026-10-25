# Design — CHG-19-EXPENSES-OPERATIONAL-UX: Registro y consulta de gastos operativos

## Evidencia observada en main
El módulo de gastos contiene filtros, tarjetas y detalles extensos; fechas 'hoy/mes' basadas en UTC, etiquetas con colores de contraste dudoso sobre tema claro, y motivos de anulación mediante prompt nativo. Se necesita una experiencia robusta sin alterar el libro financiero.

## Archivos y áreas de trabajo
- `src/routes/_app/expenses.tsx`
- `src/components/PageHeader.tsx`
- `src/lib/storage.ts`
- `tests/browser/**`

## Diseño propuesto
- Refinar formulario de gasto, categorías, dinero, fecha local, métodos, beneficiarios y comprobantes.
- Aclarar filtros, resúmenes, estados registrados/anulados, detalles y listados móviles.
- Mejorar anulación con motivo, pendiente, errores y permisos sin manipular directamente registros auditados.

## Restricciones y decisiones
- No alterar la evidencia financiera ni borrar originales; la anulación sigue por función autorizada.
- El resultado final de gasto confirmado viene de PostgreSQL, no de cálculo cliente.
- Corregir uso UTC en fechas de calendario local de RD cuando provoca periodos erróneos.
- Respetar colores de tema y contraste en labels, no usar text-neutral-300 sobre fondos blancos.

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-19-expenses-operational-ux --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
