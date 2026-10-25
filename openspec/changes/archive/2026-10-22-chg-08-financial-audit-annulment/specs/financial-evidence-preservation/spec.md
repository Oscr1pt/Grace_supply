# Spec Delta

## Purpose

Preservar evidencia de las operaciones financieras reales futuras con actor verificado y correcciones compensatorias sin pérdida silenciosa.

## ADDED Requirements

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

