# Design

## Context

Ver `proposal.md` (Finding 6). `types.ts` describe Sale.lines como arreglo y CreditPayment.creditId apuntando a dos tablas según creditType. Los SQL locales usan TEXT en referencias sin FK, NUMERIC(12,2) sin CHECK y estados libres. `uid()` no produce UUID. Las rutas previenen algunos borrados y valores solo en navegador. No se ha demostrado qué constraints existen remotamente; el manifiesto CHG-03 es precondición de implementación.

## Goals / Non-Goals

**Goals:** relaciones verificables, dominio monetario/stock válido, números únicos e instalación de restricciones conservando historia.

**Non-Goals:** recalcular automáticamente historial, completar referencias por semejanza de nombre, imponer aislamiento multiempresa inexistente o implementar concurrencia/cálculo de operaciones (CHG-07).

## Decisions

### Modelo propuesto con referencias comprobables

Usar IDs UUID y mapeo de CHG-03 sin crear otro mapeo. Relaciones propuestas:

| Hijo | Padre / regla |
| --- | --- |
| sales.client_id | clients.id, requerido |
| sale_lines.sale_id / item_id | sales.id e inventory.id; cantidad positiva; snapshots de SKU/nombre/precio preservados |
| purchases.supplier_id / item_id | suppliers.id / inventory.id cuando corresponda; NULL para compra al contado descriptiva sin artículo, nunca cadena vacía |
| client_credits.sale_id / client_id | sale y cliente existentes; cliente debe corresponder al de la venta |
| supplier_credits.purchase_id / supplier_id | compra/proveedor existentes para compra a crédito; proveedor corresponde al documento |
| credit_payments.client_credit_id / supplier_credit_id | dos FK opcionales con exactamente una presente y tipo coincidente |

Para impedir crédito con contraparte distinta, usar referencia compuesta al par documento/contraparte con clave candidata compatible en padre. Un crédito por venta y un crédito por compra (UNIQUE del documento). Compras a crédito requieren proveedor identificado; los casos heredados solo con nombre bloquean corte hasta resolverlos con evidencia aprobada.

Normalizar líneas de venta en `sale_lines` para FK y cantidades verificables. Backfill desde JSON preservando orden y snapshots, comparando representación y sumas. Durante transición conservar copia histórica restringida para recuperación; tras el corte solo la relación normalizada es fuente de escritura y el adaptador reconstruye la forma Sale.lines. Evitar dos fuentes activas divergentes. Artículos/clientes/proveedores con historia se desactivan, con ON DELETE RESTRICT/NO ACTION; no usar cascadas destructivas de documentos financieros.

Pago: conservar una sola tabla de pagos con FK tipadas y CHECK de exclusión y credit_type. El adaptador reconstruye creditId/creditType legado para lectura; entrada de negocio CHG-07 resuelve explícitamente tipo e ID. Alternativa descartada: FK de texto polimórfica imposible de validar contra dos padres; separar tablas duplicaría reglas y consultas sin necesidad.

### Dominios e invariantes de fila

Propuesta sujeta a aprobación: importes monetarios NUMERIC(18,2); tasa NUMERIC(7,4), rango 0 a 100; precios/costos no negativos; pago/gasto y total de crédito estrictamente positivos; cantidades de operación enteras positivas, stock entero no negativo conforme al uso actual de unidades. Rechazar NULL donde requerido, NaN/infinidades y exceso de precisión/rango antes de persistir; no confiar en coerción silenciosa ni comparar floats.

Crédito sin compensaciones: 0 <= paid <= total, balance = total - paid y balance >= 0. Total es el nominal original; el contrato general usa principal vigente menos pagado neto. CHG-08 añadirá cancelación explícita de principal con valor inicial cero y ampliará checks/estado para conservar nominal, compensación y neto sin contradicción. Estado pagada solo saldo cero; pendiente solo paid cero y saldo positivo; parcial cuando 0 < paid < principal vigente; vencida requiere saldo positivo. Vencimiento por fecha puede derivarse en consulta, evitando un CHECK que dependa del reloj. Purchase.total y valores de línea respetan cantidad por precio decimal; Sale.total = subtotal + tax y tax = redondeo de subtotal por tasa. CHG-07 mantiene sumas entre filas/pagos/documentos bajo transacción; no intentar subqueries en CHECK para validar agregados. Compensaciones CHG-08 se guardan como movimientos de reversión tipados con magnitud positiva, sin violar estos dominios.

### Unicidad e índices justificados

UNIQUE para SKU no vacío normalizado, receipt_no por empresa y documento de crédito por origen. Para invoice_no externo, UNIQUE por supplier_id identificado y número normalizado no vacío, sin colapsar facturas de proveedores distintos. Compras descriptivas sin proveedor identificado conservan número interno único; no se impone unicidad externa por nombre libre. El número interno de CHG-07 no equivale a comprobante fiscal.

Índices en FK de ventas-cliente, líneas-documento/artículo, compras-proveedor/artículo y pagos-crédito para joins y comprobación de borrado. Índices compuestos de créditos por contraparte/estado/fecha y documentos por created_at solo si consultas y EXPLAIN de fixture representativa justifican el plan. No duplicar índices de PK/UNIQUE ni indexar todas las columnas indiscriminadamente.

Alternativas descartadas: reglas solo en formulario; montos flotantes; UNIQUE global de factura externa; cascadas que destruyan evidencia.

## Risks / Trade-offs

- [Huérfanos, duplicados o pagos mal tipados históricos] → inventario restringido y bloqueo de corte; resolución por propietario sin borrar/fusionar silenciosamente.
- [Redondeo cambia importes antiguos] → comparar exactamente, conservar snapshots y requerir corrección financiera explícita si corresponde; no recalcular para hacer pasar CHECK.
- [Validación de constraints bloquea tráfico] → expansión controlada, validación por fases cuando soportada y ventana aprobada; UNIQUE requiere estrategia específica, no asumir NOT VALID para todo.
- [Clientes antiguos no usan modelo tipado] → adaptador y contrato versionado, cerrar escritura antigua al corte.
- [Relaciones entre totales requieren agregación] → CHG-07 es dueño de sincronía transaccional; no certificarla por CHECK de fila.

## Migration Plan

Requiere CHG-03 y recuperación CHG-00. Perfilar anomalías en staging sintético y, para datos reales, solo mediante acceso autorizado restringido sin volcar filas al repo. Expandir líneas y referencias tipadas; backfill con mapeo de CHG-03; convertir vacíos a NULL solo donde el dominio lo permite y documentar toda corrección aprobada. Crear índices/constraints en orden de padres a hijos y validar antes de contraer.

Pruebas de salida: inserts/updates SQL inválidos rechazados para montos, stock, cantidades, tipo de crédito, huérfanos y duplicados; positivos válidos aceptados; instalación/upgrade con IDs heredados, snapshots, conteos y totales conservados. Nuevas tablas sin acceso anónimo y con patrón de permisos CHG-05; si aún no está activo, permanecen cerradas.

Rollback: detener corte ante anomalías, conservar originales y mapeo. Antes de contracción retornar al adaptador compatible sin reabrir DML inseguro; después de cambios irreversibles, restaurar de manera aislada y reconciliar, bajo CHG-00. No eliminar restricciones para permitir que reaparezcan estados inválidos ni borrar documentos para validar.

## Decisiones que requieren aprobación

Precisión/rango y redondeo decimal propuestos, cantidades enteras, unicidad por proveedor, tratamiento de compras solo descriptivas y resolución documentada de anomalías. La integridad exigida en specs permanece; no se autoriza saneamiento financiero automático. El trabajo conserva las tres unidades del roadmap sin nuevas subtareas.

