# Spec Delta

## Purpose

Preservar evidencia financiera completa de Grace Supply con autoría verificada y anulación compensatoria sin pérdida silenciosa de documentos.

## ADDED Requirements

### Requirement: Evento financiero atómico y verificable
Cada creación, modificación permitida, pago, reversión o anulación financiera SHALL producir evidencia en la misma transacción, con actor verificado, tiempo de servidor, tipo, entidad y correlación de operación.

#### Scenario: Falla el registro de auditoría
- **WHEN** no puede persistirse el evento requerido
- **THEN** se revierte la operación financiera completa.

#### Scenario: Actor o tiempo del navegador
- **WHEN** el cliente envía otro actor o tiempo de registro
- **THEN** esos valores no sustituyen auth.uid() ni el timestamp del servidor.

### Requirement: Evidencia restringida y no editable
La evidencia SHALL ser de solo adición para los roles de aplicación, sin escritura directa ni alteración/borrado incluso por administradores de aplicación, y su lectura MUST restringirse a usuarios autorizados.

#### Scenario: Manipulación o lectura sin permiso
- **WHEN** un empleado intenta consultar eventos o un administrador de aplicación intenta editarlos/borrarlos
- **THEN** se deniega y la evidencia previa permanece intacta.

### Requirement: Conservación de documentos financieros
El sistema MUST impedir eliminación física y edición que sobrescriba evidencia de ventas, compras, créditos, pagos y gastos; las correcciones SHALL conservar originales y trazabilidad.

#### Scenario: Intento de DELETE financiero
- **WHEN** se intenta borrar un documento por REST, RPC o una acción heredada
- **THEN** se rechaza y el original permanece consultable con su estado vigente o anulado.

### Requirement: Anulación autorizada y motivada
Solo un administrador activo verificado SHALL anular mediante una operación controlada, con motivo obligatorio, referencia al original y protección contra repetición.

#### Scenario: Reintento o anulación concurrente
- **WHEN** dos solicitudes intentan anular el mismo documento
- **THEN** solo se genera una compensación efectiva y todos los reintentos compatibles recuperan el mismo resultado.

### Requirement: Compensación conciliada sin efectos parciales
Una anulación SHALL compensar stock y principal/saldos netos aplicables de forma atómica, sin stock ni saldo neto negativos y conservando importes y pagos originales.

#### Scenario: Compra sin stock suficiente para reversión
- **WHEN** anular la reposición dejaría stock negativo
- **THEN** se rechaza toda la anulación sin marcar documento ni crear compensación parcial.

#### Scenario: Documento con pagos vigentes
- **WHEN** se solicita anular un documento con abonos no revertidos
- **THEN** se rechaza hasta que exista reversión autorizada y trazable de esos pagos; no se borran ni se simulan devoluciones externas.

#### Scenario: Reversión de pago y anulación posterior
- **WHEN** se revierte un pago y luego se anula su documento sin abonos vigentes
- **THEN** pagos originales y reversión permanecen, el principal vigente y saldo neto quedan conciliados y la compensación no se repite.

### Requirement: Historial previo sin autoría inventada
La migración SHALL conservar el historial disponible y distinguir snapshots heredados de eventos verificados; MUST NOT atribuir actor o tiempo originales que no puedan demostrarse.

#### Scenario: Registro histórico sin actor verificable
- **WHEN** se incorpora un documento heredado
- **THEN** se identifica su procedencia y limitación, manteniendo actor original desconocido y metadatos separados del operador que registra la migración.

### Requirement: Informes con evidencia y netos coherentes
Consultas y recibos SHALL distinguir originales, anulados y compensaciones, conservando números históricos y calculando stock y saldos netos con todas las referencias.

#### Scenario: Consulta después de anular
- **WHEN** un usuario autorizado revisa historial o totales
- **THEN** ve el original y su estado/anulación vinculada, sin contar dos veces efectos ni ocultar evidencia.

