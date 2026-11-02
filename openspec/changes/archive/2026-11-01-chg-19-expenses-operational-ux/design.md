# Design — CHG-19: Gastos y experiencia operativa

## Contexto y fuente real

El flujo actual en `src/routes/_app/expenses.tsx` usa `useSupabaseTable("expenses")`, `postBusinessOperation("expense", ...)` y `runFinancialCorrection("financial_annulment", ...)`. Tiene una clave estable en `expenseKey` y claves por documento en `correctionKeys`, pero la UX debe distinguir un rechazo definitivo de un resultado incierto sin abandonar ni duplicar la intención original.

Problemas visibles: fechas iniciales y métricas derivadas de `new Date().toISOString().slice(0,10)`, campo `amount` numérico que puede ocultar errores de entrada, `window.prompt` en anulación, `Field` con `text-neutral-300` en tema claro, tabla extensa en móvil y ausencia de estados claros de loading/error/stale pese a que el hook de lectura los expone.

## D1 — Alta de gasto comprensible y segura (tarea 1.1)

- Etiquetas asociadas mediante `htmlFor/id` u otro mecanismo accesible; ayuda y mensajes de error por campo, foco en errores y validación de concepto, importe decimal positivo con 2 decimales máximo, fecha válida, categoría/medio permitido y beneficiario. No transformar silenciosamente un importe inválido en 0 ni redondear entradas arbitrarias.
- Fecha por defecto de **calendario del restaurante en República Dominicana** (`America/Santo_Domingo`), no fecha UTC. Mantener `YYYY-MM-DD` como fecha de negocio; no reinterpretarla como timestamp ni cambiar registros existentes.
- Envío con estado pendiente que impide doble clic; confirmación solamente después de operación persistida o conciliación positiva. En error de red/resultado incierto mantener formulario, valores y la misma clave de idempotencia, ofrecer reconciliación/consulta segura y evitar envío ciego. Una intención modificada después de resultado incierto no debe reutilizar su clave original para payload diferente: bloquear edición de intención pendiente hasta resolverla o empezar otra intención de forma explícita y segura.
- Gestionar errores de autorización con mensaje claro, sin elevar permisos ni cambiar tablas/RPC.

## D2 — Listado, filtros y anulación (tarea 2.1)

- Resúmenes «hoy» y «mes» calculados con calendario `America/Santo_Domingo` y registros confirmados; «período» debe reflejar los filtros activos, contar solo `registrado` en importes y distinguir anulados en conteos/etiquetas. Buscar por concepto, beneficiario y referencia; filtrar por categoría, método, estado y fechas inclusivas. Considerar límites de medianoche y cambio de mes.
- Distinguir carga inicial, vacío real, ningún resultado por filtros, error de lectura y contenido potencialmente obsoleto. Mensajes no deben representar datos no confirmados como éxito; reintento de lectura posible.
- Mejorar tabla/tarjetas y detalle en móvil, foco por teclado, nombres accesibles en botones con iconos, contraste en tema claro/oscuro. No reinventar diseño ni instalar librerías nuevas si los componentes existentes resuelven el problema.
- Sustituir `window.prompt` por diálogo accesible con motivo obligatorio, importe/concepto visibles y cancelar/confirmar. Solo administrador activo puede ejecutar anulación (autoridad final en PostgreSQL); bloquear reenvío pendiente, conservar clave por anulación, mostrar fallos recuperables, comprobar resultado confirmado y mantener registro original como `anulado` (sin borrarlo).
- El campo «comprobante» continúa como referencia textual, no archivo.

## D3 — Verificaciones proporcionales (tarea 3.1)

Pruebas con datos exclusivamente sintéticos en Supabase local **desechable y destino inequívocamente verificado**. Mantener nombres/UUID únicos; pruebas no asumir que toda la base está vacía ni eliminar datos de otras suites. Validar:

1. Registro aceptado con importes y fecha confirmados; rechazo de 0, negativos, valores no numéricos/exceso de decimales, fecha/campos inválidos y denegación por rol.
2. Fecha RD alrededor de 00:00 y paso de mes, filtros combinados, resúmenes sin incluir anulados, y estados loading/empty/error.
3. Doble clic, pérdida de respuesta antes/después de confirmar, conciliación idempotente sin gasto duplicado, y conservación de borrador/clave en estado incierto.
4. Anulación admin con motivo, rechazo sin motivo/no autorizado, reintento seguro, persistencia de evento auditado y ausencia de UPDATE/DELETE directo; teclado y viewport móvil.

Reutilizar la suite financiera y de seguridad existente solo en la parte relevante; añadir Playwright focalizado de CHG-19 sin condicionar cada ejecución a toda la suite histórica. Si la suite global falla por CHG-13 u otro caso externo, registrar la evidencia y distinguir regresión real de fallo ajeno; **nunca declarar verde una suite fallida**.

## Calidad y límites operativos

Ejecutar `npm test`, TypeScript, ESLint pertinente, `npm run build`, Playwright focalizado, integración financiera/RLS necesaria, `openspec validate chg-19-expenses-operational-ux --strict`, `git diff --check`. Si hay bloqueo funcional real dentro de CHG-19, no marcar tarea como completa. No crear stacks ni auditar JWT/Docker sin una razón específica derivada de una prueba fallida.

No modificar contratos financieros, migraciones, reglas RLS, CHG-21 ni datos Cloud. Preservar el archivo local de CHG-18, cambios protegidos (`src/routeTree.gen.ts`, `*.bak`, `scripts/chg00-anon-probe.mjs`, `resume`) y cualquier otro cambio no relacionado. No hacer commit/push/archivo durante Apply salvo autorización aparte.
