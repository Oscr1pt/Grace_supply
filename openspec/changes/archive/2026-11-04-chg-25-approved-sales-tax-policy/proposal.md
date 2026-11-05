# CHG-25 — Habilitación controlada de ventas con política tributaria aprobada

## Why

Grace Supply muestra «Ventas bloqueadas» por diseño. La política fiscal es actualmente una barrera de seguridad: la pantalla consulta `sales_posting_status`, que solo devuelve `sales_posting_supported=true` si existe aprobación, precios sin impuestos incluidos, redondeo configurado y tasa cero. El servidor `post_sale` también rechaza precios con impuesto incluido y toda tasa distinta de cero, aun si `tax_policy_approved=true`. La UI de Ajustes permite editar `tax_rate`, pero no concede aprobación. Esta configuración evita contabilizar impuestos con reglas comerciales no acordadas.

El objetivo del negocio es poder registrar ventas normales, sin falsificar aprobación tributaria, emitir comprobantes fiscales sin autorización, sacrificar exactitud monetaria o romper las protecciones actuales de inventario, clientes y créditos.

## What Changes

- Definir y documentar una política tributaria **aprobada por el propietario del negocio y comprobada con su asesor fiscal** antes de permitir su activación real: tasas y productos sujetos/exentos cuando corresponda, si precios incluyen impuestos, base y redondeo, alcance de recibos de venta, requisitos NCF/e-CF/DGII aplicables y fecha de vigencia.
- Implementar cálculo monetario determinista en PostgreSQL basado en `NUMERIC`, bajo política versionada: conservar precios y tasas de cada operación, calcular impuesto/total y contrastar la previsualización del frontend con el resultado autorizado. Mantener `post_sale` como única escritura de ventas; no inventar políticas ni suponer que todo negocio aplica una tasa fija, ni marcar `tax_policy_approved` unilateralmente.
- Ajustar `sales_posting_status` y experiencia de Ajustes/Ventas para reflejar fielmente las combinaciones **realmente implementadas**, con revisión/aprobación administrativa verificable y rechazo de variantes no implementadas; controlar permisos y registrar evidencia de aprobación.
- Añadir en Ajustes una sección «Ventas e impuestos» con un interruptor de cálculo, tasa propuesta del 18%, modo de precios sin impuesto incluido y estado `pending/approved`, sin convertir la configuración en aprobación automática.
- Clasificar productos como `gravado`, `exento` o `pendiente`; el servidor debe conservar la clasificación y usarla solo cuando exista una política aprobada y soportada.
- Identificar los documentos como recibos internos, sin afirmar validez NCF, e-CF o DGII.
- Probar posting atómico, consumo de stock, créditos, recibos, redondeo, impuestos, cambios de precio, concurrencia, rechazo sin aprobación, recuperación idempotente y aislamiento RLS en entornos locales desechables. **Cloud continúa bloqueado hasta aprobación del negocio, verificación de acceso de cuentas y preparación de despliegue**.

## Capabilities
### New Capabilities
- `approved-sales-tax-policy`: aprobación, cálculo y activación segura de ventas solo en políticas explícitamente soportadas.

## Impact

`src/lib/salesPolicy.js`, `src/routes/_app/sales.tsx`, `src/routes/_app/settings.tsx`, validación/representación de importes, `post_sale`, `sales_posting_status`, migraciones incrementales, pruebas Auth/RLS/financieras/Playwright, docs de configuración y OpenSpec. Reutilizar contratos CHG-07/08/18.

## Propuesta de negocio pendiente — no es aprobación

El propietario propone una tasa general de ITBIS del **18%**, agregada al precio base de los productos gravados, con precios inicialmente sin impuesto incluido. Esta propuesta requiere confirmación formal del propietario y su asesor contable antes de habilitar posting real. El sistema emitirá únicamente recibos internos; no implementará NCF, e-CF ni integración DGII en este Change.

## Requisitos previos de negocio — puerta de decisión, no implementación implícita

La siguiente información **no está aprobada ni suministrada** en el proyecto. No inferirla de la tasa por defecto de 18%:
- Naturaleza tributaria del negocio y operaciones realmente facturadas; tasa(s) y exenciones por artículo cuando correspondan.
- Precios de catálogo con impuestos incluidos o excluidos.
- Regla de redondeo y nivel de cálculo (línea, total, etc.).
- Qué constituye recibo interno frente a factura fiscal y si DGII exige emisión NCF/e-CF en este negocio; cómo se gestiona (integración certificada o proceso externo).
- Identidad y procedimiento de aprobación del propietario, fecha de vigencia, plan de reversión y de respaldo.

Sin decisión explícita, Codex puede realizar arquitectura, cálculos probables y pruebas **sintéticas** con parámetros claramente etiquetados, pero no puede afirmar aceptación final de habilitación fiscal ni activar ventas reales. Si hacen falta matrices de tasas por producto o facturación electrónica, documentar dependencia y separar implementación futura (máximo tres tareas del Change).

## Limites de seguridad
- No usar `UPDATE settings SET tax_policy_approved=true, tax_rate=0` en Cloud como atajo.
- No borrar el `55000` ni ignorar `sales_posting_supported` para mostrar «Nueva venta».
- No sustituir `post_sale` por escritura directa a `sales`, `sale_lines` o `inventory`.
- No declarar cumplimiento DGII/NCF/e-CF a partir de un recibo interno.
- No alterar registros financieros emitidos ni cambiar un cálculo histórico al variar la configuración.
- No modificar datos reales ni configurar Cloud sin autorización específica.
- CHG-26 (cliente no registrado/contextual) queda independiente.

## Acceptance
La entrega técnica V1 comprende las tareas 1.1, 2.1 y 3.1: reglas reflejadas por servidor/UI sin divergencias, bloqueo cuando la política está incompleta/no aprobada/unsupported, cálculos y seguridad locales probados, e identificación de recibos internos. El estado 3/3 técnico no equivale a autorización tributaria legal ni habilitación comercial: esa decisión posterior debe quedar documentada por el propietario/asesor antes de activar operaciones reales o Cloud.
