# financial-evidence-preservation Specification

## Purpose
Preservar evidencia de las operaciones financieras reales futuras con actor verificado y correcciones compensatorias sin pérdida silenciosa.

## Requirements

### Requirement: Evidencia atómica de operaciones futuras

Cada operación financiera contabilizada después de la entrega MUST registrar en su transacción actor Auth, tiempo del servidor, tipo, entidad y correlación. Si no se puede registrar el evento, la operación completa MUST revertirse.

#### Scenario: Falla la auditoría

- **WHEN** el evento de auditoría no puede persistirse
- **THEN** no se confirma ninguno de los efectos financieros.

#### Scenario: Datos de prueba existentes

- **WHEN** se prepara el nuevo esquema desde cero
- **THEN** no se fabrican eventos ni snapshots históricos para filas ficticias existentes.

### Requirement: Auditoría protegida

Los roles de aplicación MUST NOT poder modificar o eliminar evidencia y solo roles explícitamente autorizados pueden consultarla. La retención no se purga automáticamente sin política aprobada.

#### Scenario: Escritura o lectura no autorizada

- **WHEN** un rol de aplicación intenta mutar la auditoría o un usuario sin permiso intenta consultarla
- **THEN** la operación se deniega y los eventos previos permanecen intactos.

### Requirement: Documentos reales confirmados no se eliminan

Después de la entrega, las ventas, compras, créditos, pagos y gastos reales confirmados MUST conservarse; DELETE físico o cambios que sobrescriban sus importes originales MUST ser rechazados.

#### Scenario: Intento de borrar documento real

- **WHEN** una ruta, REST o RPC intenta eliminar físicamente un documento confirmado
- **THEN** se rechaza y el original sigue disponible con su estado.

### Requirement: Anulación autorizada e idempotente

Solo un administrador activo verificado MUST poder anular un documento real mediante motivo obligatorio y operación idempotente CHG-07.

#### Scenario: Reintento de anulación

- **WHEN** se repite una solicitud compatible para anular el mismo documento
- **THEN** devuelve el resultado existente sin duplicar la compensación.

### Requirement: Compensación financiera conciliada

La anulación MUST compensar stock y saldos en una sola transacción, conservando el documento y los pagos originales. No debe producir stock o saldo negativo ni afirmar devolución externa sin evidencia.

#### Scenario: Pago vigente o stock insuficiente

- **WHEN** la anulación implicaría un pago no conciliado o stock negativo
- **THEN** se rechaza completa y no deja cambios parciales.

#### Scenario: Anulación después de reversión del pago

- **WHEN** los pagos se revierten de forma autorizada y luego se anula el documento
- **THEN** originales, reversión y compensación quedan enlazados y los saldos netos se concilian.

### Requirement: Informes distinguen originales y compensaciones

Las consultas autorizadas MUST mostrar documento original, estado anulado y compensaciones vinculadas, sin contar dos veces los efectos.

#### Scenario: Consulta después de anular

- **WHEN** un usuario autorizado revisa un período con documentos anulados
- **THEN** puede distinguir los originales y sus compensaciones y los totales netos se calculan correctamente.

### Requirement: La venta conserva el nombre de contraparte confirmado
Cada venta nueva SHALL conservar como snapshot el nombre de la contraparte mostrado al confirmar, además del UUID cuando sea cliente registrado, sin reescribir documentos históricos.

#### Scenario: Nombre de cliente registrado cambia después de la venta
- **WHEN** se cambia el nombre de un cliente registrado después de confirmar una venta nueva
- **THEN** la venta y su recibo conservan el nombre snapshot confirmado junto con el UUID original.

#### Scenario: Venta ocasional sin identidad de cliente
- **WHEN** se confirma una venta al contado a un cliente ocasional
- **THEN** el documento conserva el nombre textual y carece de asociación a `clients`.

#### Scenario: Documento histórico anterior al snapshot
- **WHEN** se consulta una venta anterior que no tiene snapshot
- **THEN** permanece sin reescritura y conserva el mecanismo de lectura histórica existente.

### Requirement: Anulación de compra multilínea compensa stock de forma indivisible
La anulación autorizada SHALL compensar en una sola transacción cada línea vinculada que fue repuesta por la compra, conservar el documento y rechazar la operación completa cuando una línea vinculada no tenga existencias suficientes. Las líneas manuales SHALL permanecer fuera de las compensaciones de inventario.

#### Scenario: Anular compra con varias líneas repuestas
- **WHEN** un administrador activo anula una compra multilínea sin pagos de crédito vigentes y todas las existencias permiten revertir las cantidades
- **THEN** se marca un único documento como anulado, se reduce cada producto por su cantidad repuesta y se registra una sola compensación auditable.

#### Scenario: Stock insuficiente en una de varias líneas
- **WHEN** una línea repuesta no tiene stock suficiente al anular
- **THEN** se rechaza la anulación completa y ninguna existencia, crédito o estado del documento cambia.

#### Scenario: Compra multilínea sin reposición
- **WHEN** se anula una compra cuyas líneas no repusieron inventario
- **THEN** no se modifica inventario y se conserva el flujo existente de crédito y compensación.

#### Scenario: Anular compra manual o mixta
- **WHEN** se anula una compra con líneas manuales y, opcionalmente, líneas vinculadas repuestas
- **THEN** ninguna línea manual modifica existencias y solo se revierten las cantidades repuestas de líneas vinculadas, en la misma compensación atómica.

#### Scenario: Reintento de anulación
- **WHEN** se repite la misma anulación confirmada con su clave idempotente
- **THEN** se devuelve el resultado persistido sin descontar existencias ni duplicar compensaciones.
