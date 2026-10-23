# Design

## Context

Ver `proposal.md` (Findings 5/6). `sales.tsx` descuenta stock en Promise.all usando Math.max(0), luego inserta venta y después crédito. `purchases.tsx` inserta compra, actualiza stock y crea crédito por separado. `clients.tsx` y `suppliers.tsx` insertan pago y después actualizan saldo calculado con estado previo. Estas secuencias no son transacciones de negocio. No se han probado fallos ni concurrencia contra el despliegue.

## Goals / Non-Goals

**Goals:** una frontera transaccional PostgreSQL por intención, autoridad/cálculo de servidor, locks y claves durables de reintento.

**Non-Goals:** integrar pagos bancarios, emitir comprobantes fiscales, implementar auditoría inmutable o anulaciones (CHG-08), usar service_role en cliente ni envolver varias llamadas REST como si fueran una transacción.

## Decisions

### Contratos RPC de negocio

Proponer funciones estrechas de PostgreSQL, invocables con JWT verificado del usuario bajo CHG-05. Un endpoint intermedio, si se usa, llama una sola función transaccional con identidad de usuario; no encadena REST con credencial privilegiada ni pierde auth.uid().

| Operación propuesta | Entrada de negocio | Efectos indivisibles / permiso |
| --- | --- | --- |
| post_sale | client_id, item_id/quantity, versión/cotización esperada, payment_type, due_date, clave | validar cliente/artículos, fijar líneas/precio/tasa, stock, documento y crédito si corresponde; sales |
| post_purchase | proveedor identificado o snapshot permitido, artículo opcional, cantidad/costo decimal, restock, tipo/fecha/número externo, clave | compra, stock si solicitado y crédito de proveedor; purchases |
| post_credit_payment | tipo de crédito, ID, importe decimal, método/fecha/referencia, clave | pago y total pagado/saldo/estado del crédito; clients o suppliers según tipo |
| adjust_inventory | artículo, delta entero, motivo, versión esperada, clave | ajuste explícito de stock con resultado no negativo; inventory |

Créditos se crean dentro de venta/compra; no existe endpoint libre que fabrique saldo. Las altas de catálogo que establezcan stock inicial usan la operación de inventario en la misma transacción, no un insert de stock arbitrario. Metadatos de artículo siguen CRUD restringido. Fecha de pago es fecha de negocio; created_at/actor siempre del servidor. El cliente no suministra saldo, impuesto o actor como autoridad. IDs y números internos generados en servidor, respaldados por UNIQUE de CHG-06; secuencias pueden tener huecos tras rollback y no se prometen números fiscales correlativos.

Salida canónica: operation_id, IDs/números de documentos, total/paid/balance/stock aplicables y estado confirmado. Persistir la opción restock y los deltas efectivos de inventario vinculados al documento y operación; item_id por sí solo no demuestra que una compra repuso stock. Son datos de la operación para recuperación y futura compensación CHG-08, no un segundo audit log. Errores tipados de autorización, validación, insuficiente stock/saldo, conflicto de cotización/versión/idempotencia y transporte. CHG-01 gobierna la presentación.

### Cálculo y validación sin floats

Usar decimales de CHG-06. Propuesta: precio de venta y tasa vigentes desde base; el cliente remite versión o valores esperados como control de conflicto, no autorización de precio. Si cambian, rechazar sin efectos y pedir nueva confirmación. Sin descuentos libres ni cambios de precio por empleado en este alcance. Costo de compra es entrada autorizada validada, nunca total libre.

Propuesta de rounding: redondear cada línea a dos decimales, sumar subtotales y redondear impuesto sobre subtotal a dos decimales; total = subtotal + tax. Guardar snapshots de precio y tasa utilizados. Validar tipo de pago, vencimiento aplicable y contraparte activa; compra a crédito requiere supplier_id. Cantidades de venta repetidas del mismo artículo se agregan antes de validar stock; no se confía en múltiples líneas para evadir límites. Pago positivo no puede superar saldo exacto, eliminando tolerancia float de un centavo como autorización de sobrepago.

### Transacción y concurrencia

Reservar/comprobar identidad de operación; verificar actor activo y permiso antes de recuperar resultados; bloquear recursos compartidos y leer valores vigentes; validar todos los efectos; insertar documento/líneas/crédito/pago y actualizar stock/saldos; almacenar resultado de operación dentro de la misma transacción. Cualquier excepción aborta la totalidad. No capturar una excepción SQL para devolver éxito ni hacer commits por efecto.

Lock order común para todas las funciones y futuras anulaciones: operación/idempotencia, documentos existentes por ID, créditos por tipo/ID, inventario por ID ordenado; venta/compra nueva solo bloquea recursos compartidos existentes. Descuento de stock bajo lock y actualización condicional quantity >= solicitado. Abono bloquea crédito antes de leer saldo y calcula paid/balance desde pagos válidos en la misma transacción; compras concurrentes suman al valor bloqueado, no reemplazan con un dato cliente. Invariantes y FK/CHECK/UNIQUE refuerzan el resultado. Reintentos limitados de deadlock/serialization usan la misma clave; no rehacen intención con ID nuevo.

### Idempotencia durable y recuperación

Futura tabla protegida `business_operations`: actor Auth, tipo, clave aleatoria segura, hash canónico del contenido y resultado mínimo, UNIQUE(actor, tipo, clave). Hash incluye contraparte, líneas agregadas/ordenadas, cantidades, cotización esperada e importes/fechas relevantes. Reservar y resolver conflictos bajo la misma transacción: reintento con mismo hash espera/recupera el commit original; otro hash produce conflicto sin efecto. Si la transacción aborta, su reserva y efectos abortan juntos. No devolver resultado ajeno ni aceptar clave como sustituto de autorización actual.

Conservar claves/resultados mientras existan los documentos financieros vinculados; no usar expiración breve que permita recrear un pago antiguo. Consulta de estado por actor/clave devuelve solo resultado permitido; mantener en UI la misma clave durante timeout/reintento. El registro de idempotencia no es auditoría financiera inmutable: CHG-08 añadirá evidencia sin duplicar este mecanismo.

Alternativas descartadas: Promise.all, compensar después de fallo como si garantizara atomicidad, bloqueo solo en memoria de un servidor, deshabilitar botón como idempotencia o reintento con clave nueva.

## Risks / Trade-offs

- [Locks/deadlocks] → orden único, transacciones cortas sin llamadas externas y reintento limitado con misma clave.
- [Resultado perdido tras commit] → consulta/reintento por clave y contrato incierto CHG-01.
- [Cliente antiguo elude funciones] → retirar grants DML según CHG-05 y verificar REST directo.
- [Costo de conservar idempotencia] → resultado mínimo y retención alineada con documentos.
- [Precios cambian durante venta] → conflicto explícito; no vender a total inesperado.

## Migration Plan

Requiere CHG-01, CHG-06 (por CHG-03) y corte CHG-04/05, con recuperación CHG-00. En futura implementación: introducir versiones de funciones y registro de operaciones cerrado, probar cada contrato y locks; adaptar rutas a una sola llamada por intención; cerrar definitivamente escrituras financieras múltiples y habilitar RPC según matriz.

En Supabase local o un proyecto aislado, con dos conexiones sincronizadas y datos sintéticos: última unidad (una venta), compra y venta concurrentes sin actualización perdida, pagos simultáneos sin sobrepago, misma clave concurrente (un resultado), clave con payload distinto (conflicto), desconexión antes/después del commit y fallo inyectado en cada efecto (ningún parcial). Verificar conteos, stock, suma de pagos, paid/balance y unicidad mediante consultas autorizadas. No basta mock de cliente para demostrar concurrencia.

Salida: escenarios satisfechos y recibo/confirmación solo tras resultado canónico. Rollback: cerrar escrituras si fallan funciones; conservar operaciones ya confirmadas y reconciliar mediante IDs/claves, hacer corrección hacia adelante o versión previa de RPC segura. No regresar al cliente de múltiples escrituras ni borrar operaciones para reintentar. Restauración aislada solo con autorización CHG-00 y reconciliación de efectos posteriores.

## Decisiones que requieren aprobación

Precio vigente con confirmación ante cambio, rounding propuesto, no sobrepagos ni descuentos libres y retención durable de claves. Son decisiones explícitas para implementar; el diseño no autoriza su despliegue ni afirma que ya haya transacciones remotas.

## Decisiones acordadas y pendientes financieros

Los totales autorizados se calcularán en PostgreSQL/servidor con aritmética decimal, nunca con floats del navegador. Se usarán NUMERIC(14,2), moneda DOP y un redondeo comercial consistente, salvo que el análisis del esquema justifique otro tamaño. Se conservará en cada línea el precio realmente aplicado como snapshot histórico. El cambio de precio del catálogo no modifica documentos anteriores. Tasas configurables, tratamiento tributario y si los precios incluyen/excluyen impuestos quedan pendientes de aprobación del propietario; ninguna regla fiscal se inferirá para contabilizar. Los controles de autorización de cambios de precio y compra/pago corresponden a CHG-05.

La regla de redondeo más específica descrita en la sección de cálculo es una propuesta de implementación, no una regla financiera aprobada; se mantiene pendiente junto con la decisión tributaria.

El registro de idempotencia será persistente en PostgreSQL, protegido por actor/tipo/clave y hash canónico; no se purgará automáticamente hasta aprobar y probar la política de retención. Se evaluará 90 días como retención inicial candidata, sujeta a pruebas de reintentos tardíos, conciliación y aprobación. La expiración de una clave no podrá permitir duplicar un efecto financiero todavía vigente ni cambiar los documentos confirmados.

