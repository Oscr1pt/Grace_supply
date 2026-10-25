# Grace Supply — Primera fase de frontend (revisión y secuencia)

**Base verificada:** `main` commit `d96a48643e7dfd658375b4ed52e8abc2dcc55303` (PR #1 mergeado). **Método:** lectura de rutas, componentes, estilos, OpenSpec vigente y cobertura de pruebas. **No es** una auditoría interactiva de navegador ni confirma bugs reproduciéndolos.

## Objetivo
Conservar identidad monocroma/dorada (`#D4AF37`), logo, tipografía y composición reconocible. Mejorar precisión de UI, legibilidad, mensajes, teclado, móvil, operaciones confirmadas y manejo de fallos sin añadir módulos ajenos al producto.

## Evidencia del código
- `AppSidebar.tsx` y `_app.tsx`: sidebar `w-64` y padding `px-8`, sin patrón móvil explícito.
- `dashboard.tsx`: conteo clientes total rotulado como activos, inventario `price * quantity`, mezcla ingresos totales con gastos mensuales, ausencia de señales propias de carga/error.
- `inventory.tsx`: editor JSON de atributos expuesto, SKU aleatorio, cambios de etiqueta asíncronos desde diálogo.
- `clients.tsx` / `suppliers.tsx`: cuadros nativos de confirmación y pagos con conciliación; mensaje mal codificado `todav?a`.
- `sales.tsx` / `purchases.tsx`: operaciones seguras vía RPC, prompts de anulación, documentos densos, ventas tributariamente bloqueadas hasta aprobación.
- `expenses.tsx`: fechas por UTC y labels `text-neutral-300` que requieren comprobar contraste.
- `settings.tsx`: 'Zona de peligro' afirma borrar datos pero limpia claves localStorage; restablecer remoto no pide confirmación; tasa editable no habilita ventas.
- `team.tsx`: toasts de invitación y activación en inglés, estados de provisioning dependientes del entorno.
- `storage.ts`: lectura separa `loading/stale/loadError`; el dashboard y varias rutas todavía deben consumir esos estados de forma explícita.

## Orden propuesto
| Orden | Change | Prioridad | Motivo |
| --- | --- | --- | --- |
| 1 | CHG-14 responsive app shell | P1 | Corregir base de navegación, teclado y móvil |
| 2 | CHG-20 settings label safety | P1 | Evitar mensajes engañosos y resolver estado compartido de etiquetas |
| 3 | CHG-15 dashboard operational clarity | P1 | Corregir KPIs y estados, mejorar jerarquía |
| 4 | CHG-16 inventory operator polish | P1 | Formularios de catálogo y etiquetas tras ajustes |
| 5 | CHG-17 client supplier credit UX | P1 | CRUD, cuenta corriente y reconciliación de pagos |
| 6 | CHG-18 sales purchases safe documents | P1 | Flujos críticos financieros y recibos |
| 7 | CHG-19 expenses operational UX | P2 | Filtros, fecha local, contrastes y anulaciones |
| 8 | CHG-21 employee authentication usability | P1 | Invitaciones, privilegios, login y recuperación |

## Límites
- Exactamente 3 tareas principales por Change; no ampliar alcance en la implementación sin revisar propuesta.
- Sin cambios destructivos, sin nuevas migraciones ni despliegues Cloud implícitos.
- Preservar `postBusinessOperation`, idempotencia, conciliación, histórico, RLS, aislamiento de sesión y bloqueo fiscal de venta.
- Nuevos tests automatizados de regresión dentro de cada Change sí son parte de fase 1; la matriz exhaustiva manual de happy/sad/edge por módulo se realizará **en fase 2**.

## Incorporación a la rama local
La rama remota `feature/frontend-improvements` estaba basada en el `main` anterior al PR #1 durante esta revisión. Primero integrar `origin/main` de forma no destructiva; luego importar estas carpetas de OpenSpec desde la rama de planificación, validar con CLI y recién entonces aplicar los Changes uno por uno.

## Estado del plan
Artefactos de propuesta, diseño, tareas y delta-spec solamente. Pendiente validar con `openspec validate --changes --strict` en checkout local con CLI; NO se implementó ninguna UI.
