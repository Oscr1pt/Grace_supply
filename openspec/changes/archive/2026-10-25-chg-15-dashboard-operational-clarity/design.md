# Design — CHG-15-DASHBOARD-OPERATIONAL-CLARITY: Dashboard fiable y jerarquía profesional

## Evidencia observada en main
El dashboard muestra todas las ventas como ingresos totales y gastos solo del mes; inventario se valora con precio de venta sin describirlo y el contador de clientes incluye inactivos bajo la etiqueta 'registros activos'. La UI no distingue claramente carga/error de cero datos.

## Evidencia contrastada en `feature/frontend-improvements`

- `src/routes/_app/dashboard.tsx` suma todas las ventas no anuladas de todos los períodos bajo “Ingresos totales”; incluye documentos a crédito. Los gastos se filtran por `status === "registrado"`, pero el mes se obtiene con `new Date().toISOString()`, mientras `Expense.date` es un `date` de calendario.
- El mismo dashboard calcula inventario como `price * quantity` sobre todos los productos, incluidos inactivos, y lo llama “Valor del inventario”. El hook pide `select("*")`; el dashboard solo necesita precio, cantidad y `is_active`, nunca `cost_price`.
- El KPI de clientes usa `clients.length` y el subtítulo “registros activos”; `Client.status` sí distingue `activo` e `inactivo`.
- Las cuatro llamadas a `useSupabaseTable` solo leen `data`. El hook expone `loading`, `stale` y `loadError`, pero la pantalla los ignora y convierte lecturas fallidas/denegadas en KPIs con apariencia de cero.
- La matriz vigente limita ventas a `sales` o `clients`, inventario a `inventory`, clientes a `clients` y gastos a `expenses`. El acceso a ventas no concede acceso a inventario o clientes; el dashboard no debe pedir más permisos ni tratar una respuesta RLS vacía como un KPI confirmado cuando el usuario carece del permiso correspondiente.
- `useSettings` no expone `tax_policy_approved`, y el ajuste de política se protege fuera de los campos editables. `post_sale` rechaza ventas mientras la política siga incompleta. La acción rápida “Nueva venta” se muestra siempre, sin consultar permisos ni reflejar esa restricción; el dashboard no dispone de una fuente autorizada para afirmar que la política está aprobada.
- `PageHeader` ya aporta jerarquía tipográfica y comportamiento responsive compartidos. `StatCard` se usa también en Gastos, por lo que sus cambios deben conservar la presentación de esa pantalla.

### Decisiones de implementación derivadas

- Separar ventas contabilizadas del monto de ventas cobradas al contado; mostrar con claridad que el segundo no incluye abonos de ventas a crédito. No sumar gastos a ventas ni calcular utilidad.
- Calcular mes y día de venta en `America/Santo_Domingo`; comparar `Expense.date` como fecha local de calendario. Excluir ventas y gastos anulados.
- Valorar solo inventario activo como `precio de venta × cantidad disponible` y pedir únicamente las columnas usadas por el KPI.
- Contar clientes por estado real. Por permiso, mostrar un estado denegado en vez de inferir cero desde filas vacías filtradas por RLS.
- Conservar las tarjetas y tokens existentes; añadir estados de lectura y acciones solo para permisos efectivos. Omitir la acción de crear ventas porque el dashboard no puede confirmar una aprobación tributaria vigente.

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
